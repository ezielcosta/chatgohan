// index.js - inicia simultaneamente o painel (server.js) e o bot (chatbot.js)

console.log('🚀 Iniciando ChatGohan — Painel + Chatbot em um só processo');

// Inicia o painel (Express)
require('./server.js');

// Inicia o bot WhatsApp
require('./chatbot.js');

// Log final
console.log('✅ Painel e Chatbot iniciados com sucesso');
