/**
 * index.js
 * This file is the main entrypoint for the application.
 * It handles communication with the OpenAI API and processes responses.
 * @author  AgentVoiceResponse
 * @see https://www.agentvoiceresponse.com
 */
const express = require("express");
const { OpenAI } = require("openai");
const { loadTools, getToolHandler } = require("./loadTools");

// Load environment variables from .env file
require("dotenv").config();

// Initialize Express application
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

let type = 'openai';
// Configure OpenAI client with API key and optional base URL
const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY,
};

// Add custom base URL if provided in environment variables
if (process.env.OPENAI_BASEURL) {
  openaiConfig.baseURL = process.env.OPENAI_BASEURL;
  console.log(`Using base URL: ${process.env.OPENAI_BASEURL}`);
  if (openaiConfig.baseURL.includes('deepseek')) {
    type = 'deepseek';
  }
}

// Initialize OpenAI client
const openai = new OpenAI(openaiConfig);

/**
 * Handles a prompt stream from the client and uses the OpenAI API to generate
 * a response stream. The response stream is sent back to the client as a
 * series of Server-Sent Events.
 *
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 */
const handlePromptStream = async (req, res) => {
  // Extract messages and UUID from request body
  const { messages, uuid } = req.body;

  // Validate required parameters
  if (!messages) {
    return res.status(400).json({ message: "Messages is required" });
  }

  if (!uuid) {
    return res.status(400).json({ message: "UUID is required" });
  }

  // Add system prompt at the beginning of the messages array
  messages.unshift({
    role: "system",
    content: process.env.SYSTEM_PROMPT || "You are a helpful assistant.",
  });

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
  
    const obj = {
      model: type === 'openai' ? (process.env.OPENAI_MODEL || "gpt-3.5-turbo") : "deepseek-chat",
      messages: messages,
      stream: true,
      store: true,
      temperature: +process.env.OPENAI_TEMPERATURE || 0.0,
      max_completion_tokens: +process.env.OPENAI_MAX_TOKENS || 100,
    }

    if (!process.env.OPENAI_BASEURL) {
      // Load available tools for OpenAI
      try {
        obj.tools = loadTools();
        console.log(`Loaded ${obj.tools.length} tools for OpenAI`);
      } catch (error) {
        console.error(`Error loading tools for OpenAI: ${error.message}`);
      }
    }

    // Create streaming completion with OpenAI
    const stream = await openai.chat.completions.create(obj);

    // Variables to track content and function calls
    let functionName = "";
    let functionArgs = "";

    // Process each chunk from the stream
    for await (const chunk of stream) {
      if (!chunk.choices) {
        console.warn("Non-standard chunk:", chunk);
        continue;
      }
      for (const choice of chunk.choices) {
        // console.log(`>> Choice: ${JSON.stringify(choice)}`);
        // Handle completion of the response
        if (choice.finish_reason === "stop") {
            console.log("Ending response stream");
            res.end();
        }

        // Handle tool calls from the AI
        if (choice.finish_reason === "tool_calls") {
          console.log(`>> AI tool call: ${functionName}`);
          console.log(`>> AI tool call args: ${functionArgs}`);
          
          // Get the appropriate handler for the tool
          const handler = getToolHandler(functionName);
          if (!handler) {
            console.error(`No handler found for tool: ${functionName}`);
            res.write(JSON.stringify({ 
              type: 'text', 
              content: `I'm sorry, I cannot retrieve the requested information.` 
            }));
            continue;
          }
          
          try {
            // Execute the tool handler with the provided arguments
            const content = await handler(uuid, JSON.parse(functionArgs));
            console.log(`>> Tool response: ${functionName} ->`, content);
            res.write(JSON.stringify({ type: 'text', content }));
          } catch (error) {
            // Handle errors during tool execution
            console.error(`Error executing tool ${functionName}:`, error);
            res.write(JSON.stringify({ 
              type: 'text', 
              content: `I encountered an error while processing your request.` 
            }));
          }
        }

        // Process delta content from the stream
        if (choice.delta) {
          // Accumulate text content
          if (choice.delta.content) {
            res.write(JSON.stringify({ type: 'text', content: choice.delta.content }));
          }

          // Process tool calls
          if (choice.delta.tool_calls) {
            for (const toolCall of choice.delta.tool_calls) {
              if (toolCall.type === "function") {
                functionName = toolCall.function.name;
              } else {
                functionArgs += toolCall.function.arguments;
              }
            }
          }
        }
      }
    }

    // End the response stream
    console.log("Ending response stream");
    res.end();
  } catch (error) {
    // Handle errors during OpenAI API calls
    console.error("Error calling OpenAI API:", error.message);
    res.status(500).json({ message: "Error communicating with OpenAI" });
  }
};

// Define API endpoint for prompt streaming
app.post("/prompt-stream", handlePromptStream);

// Start the server
const port = process.env.PORT || 6002;
app.listen(port, () => {
  console.log(`OpenAI service listening on port ${port}`);
});
