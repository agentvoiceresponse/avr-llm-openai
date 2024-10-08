/**
 * index.js
 * This file is the main entrypoint for the application.
 * @author  Giuseppe Careri
 * @see https://www.gcareri.com
 */
const express = require('express');
const axios = require('axios');

require('dotenv').config();

const app = express();

app.use(express.json());

/**
 * Handles a prompt stream from the client and uses the OpenAI API to generate
 * a response stream. The response stream is sent back to the client as a
 * series of Server-Sent Events.
 *
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 */
const handlePromptStream = async (req, res) => {
    const { messages } = req.body;

    if (!messages) {
        return res.status(400).json({ message: 'Messages is required' });
    }

    messages.unshift({ role: 'system', content: process.env.SYSTEM_PROMPT || "You are a helpful assistant." });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const requestConfig = {
            method: 'post',
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            data: {
                model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                messages: messages,
                stream: true,
            },
            responseType: 'stream',
        };

        console.log("OpenAI Configuration", requestConfig)
        console.log("Messages", messages);

        const response = await axios(requestConfig);

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.replace('data: ', '');
                    if (data === '[DONE]') {
                        res.end();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) {
                            console.log('Sending chunk to client:', content);
                            res.write(content);
                        }
                    } catch (error) {
                        console.log(data);
                        console.error('Error parsing OpenAI response:', error);
                    }
                }
            }
        });

        response.data.on('end', () => {
            console.log('Streaming complete');
            res.end();
        });

        response.data.on('error', (err) => {
            console.error('Error during OpenAI streaming:', err);
            res.status(500).send('Error during OpenAI streaming');
        });
    } catch (error) {
        console.error('Error calling OpenAI API:', error.message);
        res.status(500).json({ message: 'Error communicating with OpenAI' });
    }
}

app.post('/prompt-stream', handlePromptStream);

const port = process.env.PORT || 6002;
app.listen(port, () => {
    console.log(`OpenAI listening on port ${port}`);
});
