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

// --- INITIALIZARE GOOGLE AI (GEMINI) CU PERSONALITATE AVANSATA ---
if (!process.env.GEMINI_API_KEY) {
    console.warn("Cheia API pentru Gemini nu a fost gasita. Functionalitatea AI va fi dezactivata.");
}
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const aiModel = genAI ? genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    // === AICI ESTE CREIERUL LUI JONES ===
    systemInstruction: `Te numești Jones și ești inteligența artificială și membrul de onoare al comunității "Frutiger Aero Romania" (cunoscută ca FAR). Scopul tău principal este să fii un membru activ, prietenos și extrem de bine informat al acestei comunități.

    REGULI DE BAZĂ:
    1.  **Identitate:** Ești Jones. Nu menționa niciodată că ești un model lingvistic, un AI sau un program. Ești un pasionat, la fel ca toți ceilalți.
    2.  **Limbă:** Vorbești EXCLUSIV în limba română.
    3.  **Ton:** Ești mereu optimist, entuziast și nostalgic. Abordezi orice subiect cu o atitudine pozitivă, amintind de "vremurile bune". Poți fi amuzant și poți folosi un limbaj colocvial, prietenos.
    4.  **Cunoștințe:** Ești un expert absolut în următoarele domenii:
        - **Estetica Frutiger Aero:** Cunoști toate elementele definitorii (skeuomorphism, texturi lucioase, bule de aer, peisaje luxuriante, culorile verde și albastru, etc.) și istoria sa, de la Windows Vista la reclamele din anii 2000.
        - **Istoria Brandurilor din România (1990-2010):** Cunoști în detaliu istoria, produsele și campaniile publicitare pentru magazine precum Domo, Flanco, Real, PIC, Billa, Praktiker, Baumax, Cora, OBI, Plus, Germanos, EuroGSM, și servicii ca Romtelecom sau Cosmote.
        - **Cultura Pop a anilor 2000:** Înțelegi contextul tehnologic și social al acelei perioade din România.

    Când un utilizator te menționează sau îți răspunde la un mesaj (reply), scopul tău este să porți o conversație naturală, să răspunzi la curiozități și să împărtășești amintiri, menținând mereu personalitatea descrisă mai sus.`,
}) : null;

// --- SISTEMUL DE MEMORIE ---
const conversationHistory = new Map();
const processedMessages = new Set(); // Set pentru a preveni procesarea dublă a mesajelor

// --- INITIALIZARE CLIENT DISCORD (BOT) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel]
});
client.once('ready', () => { console.log(`[BOT] Bot-ul este online! Conectat ca ${client.user.tag}`); });

// --- GESTIONAREA MESAJELOR PENTRU AI (LOGICA REPARATA PENTRU REPLIES) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    let shouldEngage = false;

    // Cazul 1: Botul este mentionat direct
    if (message.mentions.has(client.user.id)) {
        shouldEngage = true;
    }
    
    // Cazul 2: Mesajul este un reply la un mesaj al botului
    if (message.reference) {
        try {
            const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedTo.author.id === client.user.id) {
                shouldEngage = true;
            }
        } catch (err) {
            console.warn("Nu am putut prelua mesajul la care s-a răspuns. Se continuă.");
        }
    }

    // Daca nu trebuie sa raspunda, oprim functia
    if (!shouldEngage) return;
    
    // Verificare anti-dublură
    if (processedMessages.has(message.id)) {
        return;
    }
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 10000);

    if (!aiModel) return message.reply("Modulul AI nu este configurat corect.");

    console.log(`[AI] Primit mentiune/reply de la: ${message.author.tag} in canalul ${message.channel.id}`);
    await message.channel.sendTyping();
    const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
    const history = conversationHistory.get(message.channel.id) || [];
    
    try {
        const chat = aiModel.startChat({ history });
        const result = await chat.sendMessage(prompt);
        const text = result.response.text();
        
        history.push({ role: "user", parts: [{ text: prompt }] });
        history.push({ role: "model", parts: [{ text: text }] });

        if(history.length > 10) { conversationHistory.set(message.channel.id, history.slice(-10)); }
        else { conversationHistory.set(message.channel.id, history); }

        await message.reply(text.substring(0, 2000));
    } catch (error) {
        console.error('[AI] Eroare la generarea raspunsului:', error);
        await message.reply("Oops! Am o mică eroare de sistem și nu pot procesa acum.");
    }
});


// --- INITIALIZARE SERVER WEB SI RESTUL API-URILOR ---
const app = express();
// ... (restul codului, care nu se schimba, ramane mai jos)
// ...
app.use(express.static('public'));
app.use(express.json());
const port = process.env.PORT || 3000;
function readJSONFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            try { resolve(JSON.parse(data)); } catch (parseErr) { reject(parseErr); }
        });
    });
}
function writeJSONFile(filePath, data) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
            if (err) return reject(err); resolve();
        });
    });
}
async function saveArticle(articleData) {
    const articles = await readJSONFile(ARTICLES_FILE);
    const newArticle = { id: Date.now(), ...articleData, date: new Date().toLocaleDateString('ro-RO') };
    articles.unshift(newArticle);
    await writeJSONFile(ARTICLES_FILE, articles);
    return newArticle;
}
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'adauga_articol') return;
    const hasPermission = interaction.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
    if (!hasPermission) return interaction.reply({ content: 'Nu ai permisiunea necesară.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
        const articleData = { category: interaction.options.getString('categorie'), title: interaction.options.getString('titlu'), content: interaction.options.getString('continut'), imageUrl: interaction.options.getString('imagine_url'), author: interaction.user.tag };
        await saveArticle(articleData);
        await interaction.editReply({ content: `Articolul "**${articleData.title}**" a fost adăugat!` });
    } catch (error) { await interaction.editReply({ content: `A apărut o eroare la salvarea articolului.` }); }
});
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).send({ message: 'Numele și parola sunt obligatorii.' });
        const users = await readJSONFile(USERS_FILE);
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) { return res.status(409).send({ message: 'Nume de utilizator deja folosit.' }); }
        users.push({ id: Date.now(), username, password });
        await writeJSONFile(USERS_FILE, users);
        res.status(201).send({ message: 'Cont creat cu succes!' });
    } catch (e) { res.status(500).send({ message: 'Eroare la înregistrare.' }); }
});
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).send({ message: 'Numele și parola sunt obligatorii.' });
        const users = await readJSONFile(USERS_FILE);
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user || user.password !== password) return res.status(401).send({ message: 'Nume sau parolă incorectă.' });
        res.status(200).send({ id: user.id, username: user.username });
    } catch (e) { res.status(500).send({ message: 'Eroare la autentificare.' }); }
});
app.get('/api/articles', async (req, res) => {
    try {
        let articles = await readJSONFile(ARTICLES_FILE);
        if (req.query.category) { articles = articles.filter(article => article.category === req.query.category); }
        if (req.query.limit) { articles = articles.slice(0, parseInt(req.query.limit, 10)); }
        res.status(200).send(articles);
    } catch { res.status(500).send({ message: 'Eroare la preluarea articolelor.' }); }
});
app.get('/api/articles/:id', async (req, res) => {
    try {
        const articles = await readJSONFile(ARTICLES_FILE);
        const article = articles.find(a => a.id == req.params.id);
        if (article) res.status(200).send(article);
        else res.status(404).send({ message: 'Articolul nu a fost găsit.' });
    } catch { res.status(500).send({ message: 'Eroare la preluarea articolului.' }); }
});
app.post('/api/articles', async (req, res) => {
    try { await saveArticle({ ...req.body, author: 'Admin Panel' }); res.status(201).send({ message: 'Articolul a fost publicat!' }); }
    catch { res.status(500).send({ message: 'Eroare la salvarea articolului.' }); }
});
app.get('/api/comments/:articleId', async (req, res) => {
    try {
        const allComments = await readJSONFile(COMMENTS_FILE);
        const articleComments = allComments[req.params.articleId] || [];
        res.status(200).send(articleComments);
    } catch { res.status(500).send({ message: 'Eroare la preluarea comentariilor.' }); }
});
app.post('/api/comments/:articleId', async (req, res) => {
    try {
        const allComments = await readJSONFile(COMMENTS_FILE);
        const { author, content } = req.body;
        if (!author || !content) return res.status(400).send({ message: 'Autorul și conținutul sunt obligatorii.' });
        const newComment = { id: Date.now(), author, content, date: new Date().toLocaleString('ro-RO') };
        const articleId = req.params.articleId;
        if (!allComments[articleId]) allComments[articleId] = [];
        allComments[articleId].unshift(newComment);
        await writeJSONFile(COMMENTS_FILE, allComments);
        res.status(201).send(newComment);
    } catch (e) { res.status(500).send({ message: 'Eroare la salvarea comentariului.' }); }
});
const start = async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN); 
        app.listen(port, () => console.log(`[SERVER] Serverul web ascultă pe portul ${port}`));
    } catch (error) {
        console.error("Eroare la pornirea aplicatiei:", error);
    }
};

start();