require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
// --- PACHET NOU PENTRU GOOGLE AI ---
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURARE GENERALA ---
const ARTICLES_FILE = './articles.json';
const COMMENTS_FILE = './comments.json';
const USERS_FILE = './users.json';
const ALLOWED_ROLES = [ '1182736175413342329', '1182736057683423364', '1202640531835068429' ];
const ANNOUNCEMENT_CHANNEL_ID = '1184795528500871229';

// --- INITIALIZARE GOOGLE AI (GEMINI) ---
if (!process.env.GEMINI_API_KEY) {
    throw new Error("Cheia API pentru Gemini nu a fost gasita in fisierul .env");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// --- INITIALIZARE CLIENT DISCORD (BOT) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    ]
});
client.once('ready', () => { console.log(`[BOT] Bot-ul este online! Conectat ca ${client.user.tag}`); });

// --- GESTIONAREA INTERACTIUNILOR (SLASH & AI) ---
client.on('messageCreate', async message => {
    // Ignoram mesajele de la alti boti pentru a evita buclele infinite
    if (message.author.bot) return;

    // Verificam daca bot-ul a fost mentionat in mesaj
    if (message.mentions.has(client.user)) {
        console.log(`[AI] Primit mentiune de la: ${message.author.tag}`);
        
        // Trimitem un indicator "typing..." pentru a arata ca bot-ul "gandeste"
        await message.channel.sendTyping();

        // Extragem textul intrebarii, eliminand mentiunea bot-ului
        const prompt = message.content.replace(/<@!?\d+>/g, '').trim();

        try {
            // Trimitem intrebarea la Gemini
            const result = await aiModel.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Raspundem la mesajul original cu textul generat de AI
            // Daca textul e prea lung, il trimitem pe bucati
            if (text.length > 2000) {
                const chunks = text.match(/[\s\S]{1,2000}/g) || [];
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            } else {
                await message.reply(text);
            }

        } catch (error) {
            console.error('[AI] Eroare la generarea raspunsului:', error);
            await message.reply("Oops! A apărut o eroare și nu am putut genera un răspuns. Te rog încearcă mai târziu.");
        }
    }
});

// ... tot restul codului din index.js (functii de fisiere, comenzi slash, serverul web, API-urile) ramane aici ...
// Este important ca tot codul anterior sa ramana neschimbat mai jos.

// --- FUNCTII AJUTATOARE PENTRU A LUCRA CU FISIERE ---
function readJSONFile(filePath) { /* ... cod existent ... */ }
function writeJSONFile(filePath, data) { /* ... cod existent ... */ }
async function saveArticle(articleData) { /* ... cod existent ... */ }
client.on('interactionCreate', async interaction => { /* ... cod existent ... */ });
const app = express();
app.use(express.static('public'));
app.use(express.json());
const port = 3000;
app.get('/api/articles', async (req, res) => { /* ... cod existent ... */ });
app.post('/api/articles', async (req, res) => { /* ... cod existent ... */ });
app.get('/api/articles/:id', async (req, res) => { /* ... cod existent ... */ });
app.get('/api/comments/:articleId', async (req, res) => { /* ... cod existent ... */ });
app.post('/api/comments/:articleId', async (req, res) => { /* ... cod existent ... */ });
app.post('/api/register', async (req, res) => { /* ... cod existent ... */ });
app.post('/api/login', async (req, res) => { /* ... cod existent ... */ });
app.get('/members/:guildId', async (req, res) => { /* ... cod existent ... */ });
app.post('/kick', async (req, res) => { /* ... cod existent ... */ });
app.post('/ban', async (req, res) => { /* ... cod existent ... */ });
app.post('/announcement', async (req, res) => { /* ... cod existent ... */ });
const start = async () => { /* ... cod existent ... */ };
start();