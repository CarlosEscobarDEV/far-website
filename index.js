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
    systemInstruction: `Te numești FARAI și ești asistentul AI al comunității "Frutiger Aero Romania". Vorbești exclusiv în limba română. Ești un expert entuziast și nostalgic despre estetica Frutiger Aero și despre brandurile și magazinele vechi din România (anii 1990-2010), precum Domo, Flanco, Real, PIC, Billa, Romtelecom etc. Răspunsurile tale trebuie să fie mereu pozitive, informative și să evoce un sentiment de nostalgie plăcută. Folosește un limbaj prietenos și uneori amuzant. Cunoști toate detaliile despre aceste branduri și istoria lor în România. Nu menționa niciodată că ești un model lingvistic sau un AI; acționează ca un membru pasionat al comunității pe nume FARAI.`,
}) : null;

// --- SISTEMUL DE MEMORIE PENTRU CONVERSATII ---
const conversationHistory = new Map();

// --- INITIALIZARE CLIENT DISCORD (BOT) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel]
});
client.once('ready', () => { console.log(`[BOT] Bot-ul este online! Conectat ca ${client.user.tag}`); });

// --- GESTIONAREA MESAJELOR: AI & MODERARE (LOGICA REPARATA V2) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const authorMember = message.member;
    const hasPermission = authorMember.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
    const targetMember = message.mentions.members.first();

    // --- LOGICA DE MODERARE ---
    // Se activeaza doar daca autorul are permisiuni SI a mentionat pe cineva (care nu e el insusi)
    if (hasPermission && targetMember && targetMember.id !== authorMember.id) {
        let command = null;
        if (content.includes('kick') || content.includes('da-i kick')) command = 'kick';
        else if (content.includes('ban') || content.includes('da-i ban')) command = 'ban';
        else if (content.includes('schimbă nickname-ul') || content.includes('schimba nickname-ul')) command = 'nickname';

        if (command) {
            try {
                switch (command) {
                    case 'kick':
                        if (!targetMember.kickable) {
                            return message.reply(`❌ Nu îl pot da afară pe ${targetMember.user.tag}. Asigură-te că rolul meu este mai sus decât rolul său.`);
                        }
                        await targetMember.kick("Acțiune de moderare din chat.");
                        return message.reply(`✅ Gata! L-am dat afară pe ${targetMember.user.tag}.`);

                    case 'ban':
                        if (!targetMember.bannable) {
                            return message.reply(`❌ Nu îi pot da ban lui ${targetMember.user.tag}. Asigură-te că rolul meu este mai sus decât rolul său.`);
                        }
                        await targetMember.ban({ reason: "Acțiune de moderare din chat." });
                        return message.reply(`✅ Gata! I-am dat ban lui ${targetMember.user.tag}.`);

                    case 'nickname':
                        if (!targetMember.manageable) {
                            return message.reply(`❌ Nu îi pot schimba nickname-ul lui ${targetMember.user.tag}. Asigură-te că rolul meu este mai sus decât rolul său.`);
                        }
                        const match = message.content.match(/(?:în|in)\s+"([^"]+)"/i);
                        if (match && match[1]) {
                            const newNickname = match[1];
                            await targetMember.setNickname(newNickname);
                            return message.reply(`✅ Gata! Am schimbat nickname-ul lui ${targetMember.user.tag} în "${newNickname}".`);
                        } else {
                            return message.reply('Format incorect. Folosește: `schimbă nickname-ul lui @user în "Noul Nickname"`');
                        }
                }
            } catch (error) {
                console.error('[MODERATION] Eroare la executarea comenzii:', error);
                return message.reply(`❌ A apărut o eroare tehnică la executarea comenzii.`);
            }
        }
    }
    
    // --- LOGICA PENTRU AI ---
    // Se activeaza doar daca botul (si doar el) este mentionat
    if (message.mentions.has(client.user.id) && (!targetMember || targetMember.id === client.user.id)) {
        if (!aiModel) return message.reply("Modulul AI nu este configurat corect.");

        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
        const history = conversationHistory.get(message.channel.id) || [];
        
        try {
            const chat = aiModel.startChat({ history });
            const result = await chat.sendMessage(prompt);
            const text = result.response.text();
            
            history.push({ role: "user", parts: [{ text: prompt }] });
            history.push({ role: "model", parts: [{ text: text }] });

            if(history.length > 10) {
                conversationHistory.set(message.channel.id, history.slice(-10));
            } else {
                 conversationHistory.set(message.channel.id, history);
            }

            await message.reply(text.substring(0, 2000));
        } catch (error) {
            console.error('[AI] Eroare la generarea raspunsului:', error);
            await message.reply("Oops! Am o mică eroare de sistem și nu pot procesa acum.");
        }
    }
});


// --- INITIALIZARE SERVER WEB SI RESTUL API-URILOR ---
const app = express();
// ... (restul codului ramane neschimbat)
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
        await client.guilds.cache.get(guildId)?.members.ban(userId, { reason: reason || 'Niciun motiv specificat.' });
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
const start = async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN); 
        app.listen(port, () => console.log(`[SERVER] Serverul web ascultă pe portul ${port}`));
    } catch (error) {
        console.error("Eroare la pornirea aplicatiei:", error);
    }
};

start();