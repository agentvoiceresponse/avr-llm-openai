
require("dotenv").config();

const axios = require("axios");

module.exports = {
  name: "avr_transfer",
  description: "Transfers a call to a specific extension.",
  input_schema: {
    type: "object",
    properties: {
      transfer_extension: {
        type: "string",
        description: "The transfer extension to transfer the call to.",
      },
      transfer_context: {
        type: "string",
        description: "The context to transfer the call to.",
      },
      transfer_priority: {
        type: "string",
        description: "The priority of the transfer.",
      },
    },
    required: ["transfer_extension"],
  },
  handler: async (
    uuid,
    { transfer_extension, transfer_context, transfer_priority }
  ) => {
    console.log("Transfering call to:", transfer_extension);
    console.log("UUID:", uuid);

    try {
      const url = process.env.AMI_URL || "http://127.0.0.1:6006";
      const res = await axios.post(`${url}/transfer`, {
        uuid,
        exten: transfer_extension,
        context: transfer_context || "demo",
        priority: transfer_priority || 1,
      });
      console.log("Transfer response:", res.data);
      return res.data.message;
    } catch (error) {
      console.error("Error during transfer:", error.message);
      return `Error during transfer: ${error.message}`;
    }
  },
};
