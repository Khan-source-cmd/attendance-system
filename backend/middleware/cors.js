/**
 * CORS Middleware Configuration
 */
const cors = require('cors');

const corsOptions = {
    origin: ['http://localhost:3000', 'http://localhost:4000'], // Adjust as needed
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
};

module.exports = cors(corsOptions);
