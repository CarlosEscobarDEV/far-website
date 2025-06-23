require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURARE GENERALA ---
const ARTICLES_FILE = './articles.json';
const COMMENTS_FILE = './comments.json';
const USERS_FILE = './users.json';
const ALLOWED_ROLES = [ '1182736175413342329', '1182736057683423364', '1202640531835068429' ];
const ANNOUNCEMENT_CHANNEL_ID = '1184795528500871229';

// --- INITIALIZARE GOOGLE AI (GEMINI) CU PERSONALITATE ---
if (!process.env.GEMINI_API_KEY) {
    console.warn("Cheia API pentru Gemini nu a fost gasita. Functionalitatea AI va fi dezactivata.");
}
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const aiModel = genAI ? genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `Te numești Jones și ești inteligența artificială și membrul de onoare al comunității "Frutiger Aero Romania" (cunoscută ca FAR)... (restul instructiunilor)`,
}) : null;

// --- SISTEMUL DE MEMORIE ---
const conversationHistory = new Map();
const processedMessages = new Set();

// --- INITIALIZARE CLIENT DISCORD (BOT) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel]
});
client.once('ready', () => { console.log(`[BOT] Bot-ul este online! Conectat ca ${client.user.tag}`); });

// --- GESTIONAREA MESAJELOR PENTRU AI ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    let shouldEngage = false;
    if (message.mentions.has(client.user.id)) { shouldEngage = true; }
    if (message.reference) {
        try {
            const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedTo.author.id === client.user.id) { shouldEngage = true; }
        } catch (err) { console.warn("Nu am putut prelua mesajul la care s-a răspuns."); }
    }
    if (!shouldEngage) return;
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 10000);
    if (!aiModel) return message.reply("Modulul AI nu este configurat corect.");
    console.log(`[AI] Primit mentiune/reply de la: ${message.author.tag}`);
    await message.channel.sendTyping();
    const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
    const history = conversationHistory.get(message.channel.id) || [];
    try {
        const chat = aiModel.startChat({ history });
        const result = await chat.sendMessage(prompt);
        const text = result.response.text();
        history.push({ role: "user", parts: [{ text: prompt }] }, { role: "model", parts: [{ text: text }] });
        conversationHistory.set(message.channel.id, history.length > 10 ? history.slice(-10) : history);
        await message.reply(text.substring(0, 2000));
    } catch (error) {
        console.error('[AI] Eroare la generarea raspunsului:', error);
        await message.reply("Oops! Am o mică eroare de sistem și nu pot procesa acum.");
    }
});


// --- INITIALIZARE SERVER WEB SI API-URI ---
const app = express();
app.use(express.static('public'));
app.use(express.json());
const port = process.env.PORT || 3000;

function readJSONFile(filePath) { /* ... cod existent ... */ }
function writeJSONFile(filePath, data) { /* ... cod existent ... */ }

// === MODIFICAREA CHEIE ESTE AICI ===
// API pentru anunturi (actualizat pentru a primi autorul)
app.post('/announcement', async (req, res) => {
    try {
        // Acum extragem si autorul din cerere
        const { title, message, author } = req.body;
        if (!title || !message) return res.status(400).send({ message: 'Lipsesc titlul sau mesajul.' });
        
        const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        
        // Folosim numele autorului in subsol, cu un text de rezerva
        const footerText = author ? `Mesaj trimis de: ${author}` : 'FAR Strategic Command';
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📢 ${title}`)
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: footerText });
            
        await channel.send({ embeds: [embed] });
        res.status(200).send({ message: 'Anunțul a fost publicat!' });
    } catch (e) {
        console.error("Eroare la trimiterea anuntului:", e);
        res.status(500).send({ message: 'Nu s-a putut trimite anunțul.' });
    }
});

// ... restul API-urilor (register, login, articles, comments, members) raman la fel ...
app.post('/api/register', async (req, res) => { /* ... cod existent ... */ });
app.post('/api/login', async (req, res) => { /* ... cod existent ... */ });
app.get('/api/articles', async (req, res) => { /* ... cod existent ... */ });
// etc...

// --- PORNIREA APLICATIEI ---
const start = async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        app.listen(port, () => console.log(`[SERVER] Serverul web ascultă pe portul ${port}`));
    } catch (error) {
        console.error("Eroare la pornirea aplicatiei:", error);
    }
};
start();
