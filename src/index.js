const axios = require('axios');
const mongoose = require('mongoose');

// Set the BSC API URL
const apiUrl = 'https://api.bscscan.com/';

// Set the threshold percentage increase in token holders that will trigger the signal
const thresholdIncrease = 5; // 5%

// Set the interval time (in milliseconds) to check for new token holders
// const intervalTime = 60000; // 1 minute
const intervalTime = 5000; // 1 minute

// Set up the database connection
mongoose.connect('mongodb://localhost/my_database', { useNewUrlParser: true, useUnifiedTopology: true });

// Define the database schema
const tokenSchema = new mongoose.Schema({
    contractAddress: String,
    lastTotalHolders: Number,
});

// Define the database model
const Token = mongoose.model('Token', tokenSchema);

async function getNewTokenHolders(contractAddress, lastTotalHolders) {
    try {
        // Get the contract's total number of token holders
        const response = await axios.get(`${apiUrl}/api/v1/token/${contractAddress}`);
        const totalHolders = response.data.data.holders;

        // Check if the total number of token holders has increased by the threshold percentage
        const percentageIncrease = ((totalHolders - lastTotalHolders) / lastTotalHolders) * 100;
        if (percentageIncrease >= thresholdIncrease) {
            console.log(`Signal triggered: ${contractAddress} token holders increased by ${percentageIncrease.toFixed(2)}%`);
            // TODO: Buy the token here
        }

        // Update the last total number of token holders for the token in the database
        await Token.updateOne({ contractAddress }, { lastTotalHolders: totalHolders });
    } catch (error) {
        console.error(error);
    }
}

async function main() {
    try {
        // Get the list of all the token contract addresses on the BSC network
        const response = await axios.get(`${apiUrl}/api/v1/tokens`);
        const contractAddresses = response.data.map((token) => token.address);

        // Check if each token contract address is already in the database
        for (const contractAddress of contractAddresses) {
            const token = await Token.findOne({ contractAddress });

            if (!token) {
                // Add the token to the database with the current number of token holders as the last known number of token holders
                const response = await axios.get(`${apiUrl}/api/v1/token/${contractAddress}`);
                const totalHolders = response.data.data.holders;
                await Token.create({ contractAddress, lastTotalHolders: totalHolders });
            } else {
                // Get the last known number of token holders for the token from the database
                const lastTotalHolders = token.lastTotalHolders;

                // Get the current number of token holders for the token from BSC's API
                const response = await axios.get(`${apiUrl}/api/v1/token/${contractAddress}`);
                const totalHolders = response.data.data.holders;

                // Check if the total number of token holders has increased by the threshold percentage
                const percentageIncrease = ((totalHolders - lastTotalHolders) / lastTotalHolders) * 100;
                if (percentageIncrease >= thresholdIncrease) {
                    console.log(`Signal triggered: ${contractAddress} token holders increased by ${percentageIncrease.toFixed(2)}%`);
                    // TODO: Buy the token here
                }

                // Update the last total number of token holders for the token in the database
                await Token.updateOne({ contractAddress }, { lastTotalHolders: totalHolders });
            }
        }
    } catch (error) {
        console.error(error);
    }
}

// Call the main function every intervalTime milliseconds
setInterval(main, intervalTime);

