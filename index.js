require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');

// --- CONFIGURARE GENERALA ---
const ARTICLES_FILE = './articles.json';
const COMMENTS_FILE = './comments.json';
const USERS_FILE = './users.json';
const ALLOWED_ROLES = [ '1182736175413342329', '1182736057683423364', '1202640531835068429' ];
const ANNOUNCEMENT_CHANNEL_ID = '1184795528500871229';

// --- INITIALIZARE CLIENT DISCORD (BOT) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    ]
});
client.once('ready', () => { console.log(`[BOT] Bot-ul este online! Conectat ca ${client.user.tag}`); });

// --- FUNCTII AJUTATOARE PENTRU A LUCRA CU FISIERE ---
function readJSONFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            try {
                resolve(JSON.parse(data));
            } catch (parseErr) {
                reject(parseErr);
            }
        });
    });
}
function writeJSONFile(filePath, data) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

// --- LOGICA PENTRU ARTICOLE ---
async function saveArticle(articleData) {
    const articles = await readJSONFile(ARTICLES_FILE);
    const newArticle = { id: Date.now(), ...articleData, date: new Date().toLocaleDateString('ro-RO') };
    articles.unshift(newArticle);
    await writeJSONFile(ARTICLES_FILE, articles);
    return newArticle;
}

// --- GESTIONAREA COMENZILOR SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'adauga_articol') return;
    const hasPermission = interaction.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
    if (!hasPermission) return interaction.reply({ content: 'Nu ai permisiunea necesară.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
        const articleData = {
            category: interaction.options.getString('categorie'),
            title: interaction.options.getString('titlu'),
            content: interaction.options.getString('continut'),
            imageUrl: interaction.options.getString('imagine_url'),
            author: interaction.user.tag
        };
        await saveArticle(articleData);
        await interaction.editReply({ content: `Articolul "**${articleData.title}**" a fost adăugat!` });
    } catch (error) {
        await interaction.editReply({ content: `A apărut o eroare la salvarea articolului.` });
    }
});

// --- INITIALIZARE SERVER WEB ---
const app = express();
app.use(express.static('public'));
app.use(express.json());
const port = 3000;

// --- API (RUTE) PENTRU SITE ---
console.log('[SERVER] Se configurează rutele API...');

// --- RUTE PENTRU UTILIZATORI (Register/Login) ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).send({ message: 'Numele și parola sunt obligatorii.' });
        const users = await readJSONFile(USERS_FILE);
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).send({ message: 'Nume de utilizator deja folosit.' });
        }
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

// --- RUTE PENTRU ARTICOLE si COMENTARII ---
app.get('/api/articles', async (req, res) => { /* ... codul existent ... */ });
app.get('/api/articles/:id', async (req, res) => { /* ... codul existent ... */ });
app.post('/api/articles', async (req, res) => { /* ... codul existent ... */ });
app.get('/api/comments/:articleId', async (req, res) => { /* ... codul existent ... */ });
app.post('/api/comments/:articleId', async (req, res) => { /* ... codul existent ... */ });

// --- RUTE PENTRU ADMIN MANAGEMENT (ACUM REACTIVATE) ---
app.get('/members/:guildId', async (req, res) => {
    try {
        const guild = await client.guilds.fetch(req.params.guildId);
        await guild.members.fetch();
        const membersList = guild.members.cache.filter(m => !m.user.bot).map(m => ({ id: m.id, name: m.user.tag, displayName: m.displayName }));
        res.status(200).send(membersList);
    } catch (e) { res.status(500).send({ message: 'Eroare la preluarea membrilor.' }); }
});
app.post('/kick', async (req, res) => {
    try {
        const { guildId, userId, reason } = req.body;
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        await member.kick(reason || 'Niciun motiv specificat.');
        res.status(200).send({ message: `Membrul ${member.user.tag} a fost dat afară!` });
    } catch (e) { res.status(500).send({ message: 'Nu s-a putut da kick membrului.' }); }
});
app.post('/ban', async (req, res) => {
    try {
        const { guildId, userId, reason } = req.body;
        const guild = await client.guilds.fetch(guildId);
        await guild.members.ban(userId, { reason: reason || 'Niciun motiv specificat.' });
        res.status(200).send({ message: `Utilizatorul cu ID ${userId} a primit BAN!` });
    } catch (e) { res.status(500).send({ message: 'Nu s-a putut da ban membrului.' }); }
});
app.post('/announcement', async (req, res) => {
    try {
        const { title, message } = req.body;
        const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const embed = new EmbedBuilder().setColor('#0099ff').setTitle(`📢 ${title}`).setDescription(message).setTimestamp().setFooter({ text: 'FAR Strategic Command' });
        await channel.send({ embeds: [embed] });
        res.status(200).send({ message: 'Anunțul a fost publicat!' });
    } catch (e) { res.status(500).send({ message: 'Nu s-a putut trimite anunțul.' }); }
});


// --- PORNIREA APLICATIEI ---
const start = async () => {
    try {
        // === LINIA DE COD REPARATA (DECOMENTATA) ===
        await client.login(process.env.DISCORD_TOKEN); 
        app.listen(port, () => console.log(`[SERVER] Serverul web ascultă pe http://localhost:${port}`));
    } catch (error) {
        console.error("Eroare la pornirea aplicatiei:", error);
    }
};

start();
