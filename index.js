// index.js - inicia simultaneamente o painel (server.js) e o bot (chatbot.js)
require('./server.js');
require('./chatbot.js');
console.log('Iniciando painel + chatbot — processo único (index.js)');
