const { Web3 } = require('web3');
const mongoose = require('mongoose');
const axios = require('axios');
const { RateLimiter } = require('limiter');
const config = require('config');

// Set the BSC node URL
const nodeUrl = 'https://bsc-dataseed.binance.org';

// Set the threshold percentage increase in token holders that will trigger the signal
const thresholdIncrease = 5; // 5%

// Set the interval time (in milliseconds) to check for new token holders
const intervalTime = 2000; // 1 minute

const bscApiLimitPerSecond = 5;
const limiter = new RateLimiter({ tokensPerInterval: bscApiLimitPerSecond, interval: "second" });

// Set up the database connection
const host = config.get('mongo.host');
const port = config.get('mongo.port');
const user = config.get('mongo.user');
const password = config.get('mongo.password');
mongoose.connect(`mongodb://${user}:${password}@${host}:${port}/`, { useNewUrlParser: true, useUnifiedTopology: true });

// Define the database schema
const tokenSchema = new mongoose.Schema({
    contractAddress: String,
    lastTotalHolders: String,
});

// Define the database model
const Token = mongoose.model('Token', tokenSchema);

async function getABI(contractAddress) {
    try {
        const apiUrl = `https://api.bscscan.com/api`;
        const apiKey = config.get('bscscan.apiKey');
        const response = await axios.get(`${apiUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${apiKey}`);

        return response.data.result;
    } catch (error) {
        console.error(error);
    }
}

async function getNewTokenHolders(contractAddress, lastTotalHolders) {
    try {
        if (contractAddress === undefined || lastTotalHolders === undefined) { return; }
        // Get the contract's total number of token holders
        const web3 = new Web3(nodeUrl);
        const abi = await getABI(contractAddress);
        const contract = new web3.eth.Contract(JSON.parse(abi), contractAddress);
        const totalHolders = await contract.methods.totalSupply().call();

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
        // Get the latest block number
        const web3 = new Web3(nodeUrl);
        const latestBlockNumber = await web3.eth.getBlockNumber();

        // Get the latest block
        const latestBlock = await web3.eth.getBlock(latestBlockNumber, true);

        // Scan the transactions in the latest block for new token addresses
        const tokenAddresses = new Set();
        for (const tx of latestBlock.transactions) {
            // Check if the transaction is a token transfer
            if (tx.to !== null && tx.input.slice(0, 10) === '0xa9059cbb') {
                const tokenAddress = tx.to.toLowerCase();
                tokenAddresses.add(tokenAddress);
            }
        }

        // Check if each token address is already in the database
        for (const contractAddress of tokenAddresses) {
            const token = await Token.findOne({ contractAddress });

            if (limiter.tryRemoveTokens(1) === false) {
                console.log("Rate limit reached");
                continue;
            }

            if (!token) {
                // Add the token to the database with the current number of token holders as the last known number of token holders
                const web3 = new Web3(nodeUrl);
                const abi = await getABI(contractAddress);
                const contract = new web3.eth.Contract(JSON.parse(abi), contractAddress);
                const totalHolders = await contract.methods.totalSupply().call();
                await Token.create({ contractAddress, lastTotalHolders: totalHolders.toString() });
                console.log("Adding token address: " + contractAddress);
            } else {
                // Get the last known number of token holders for the token from thedatabase
                const lastTotalHolders = BigInt(token.lastTotalHolders);
                // Get the current number of token holders for the token from BSC's blockchain
                await getNewTokenHolders(contractAddress, lastTotalHolders);
            }
        }

    } catch (error) {
        console.error(error);
    }
}

// Call the main function every intervalTime milliseconds
setInterval(main, intervalTime);

