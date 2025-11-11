const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const routes = require('./src/api/endPoints');
const cors = require('cors');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


const allowedOrigins = [
      "http://localhost:5173",
      "https://tinku.softcraftbol.com",
      "http://localhost:3000",
    ];

 app.use(cors({
    origin: function (origin, callback) {
        console.log('Request origin:', origin);  // Añadir para depurar
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true 
}));


app.use('/', routes);

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});