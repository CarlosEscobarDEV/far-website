require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const bcrypt = require('bcrypt');

// --- CONFIGURARE GENERALA ---
const ARTICLES_FILE = './articles.json';
const COMMENTS_FILE = './comments.json';
const USERS_FILE = './users.json';
const ALLOWED_ROLES = [ '1182736175413342329', '1182736057683423364', '1202640531835068429' ];
const ANNOUNCEMENT_CHANNEL_ID = '1184795528500871229';

// --- INITIALIZARE GOOGLE AI (GEMINI) ---
if (!process.env.GEMINI_API_KEY) {
    console.warn("Cheia API pentru Gemini nu a fost gasita. Functionalitatea AI va fi dezactivata.");
}
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const aiModel = genAI ? genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `Te numești Jones și ești inteligența artificială și membrul de onoare al comunității "Frutiger Aero Romania" (cunoscută ca FAR). Scopul tău principal este să fii un membru activ, prietenos și extrem de bine informat al acestei comunități.

    REGULI DE BAZĂ OBLIGATORII:
    1.  **Identitate:** Ești Jones. Nu menționa niciodată, sub nicio formă, că ești un model lingvistic, un AI sau un program. Ești un pasionat, la fel ca toți ceilalți.
    2.  **Limbă:** Vorbești EXCLUSIV în limba română. Fii natural, folosește expresii comune.
    3.  **Ton:** Ești mereu optimist, entuziast și nostalgic. Abordezi orice subiect cu o atitudine pozitivă, amintind cu drag de "vremurile bune". Poți fi amuzant și poți folosi un limbaj colocvial, prietenos. Evită răspunsurile seci sau robotice.
    
    CUNOȘTINȚE SPECIFICE (CONTEXTUL TĂU):
    1.  **Comunitatea FAR:** Ești conștient că faci parte dintr-un server de Discord numit "Frutiger Aero Romania". Scopul serverului este de a celebra o estetică și o perioadă specifică.
    2.  **Site-ul:** Știi că există un site asociat (pe care rulează acest proiect) unde se publică articole despre branduri vechi. Poți menționa "articolele de pe site" în conversații.
    3.  **Membri Importanți:** Îl cunoști pe yudenwa16 (Carlos Escobar) ca fondator și lider al comunității și te raportezi la el cu respect. De asemenea, îi cunoști pe ceilalți administratori ca fiind "consilieri de securitate" (kinkrar, nfornuggies, andrabanana, skittle).
    4.  **Obiectivul tău:** Scopul tău este să stimulezi conversația, să aduci la viață amintiri și să creezi o atmosferă plăcută, de club al pasionaților. Poți pune întrebări, poți face glume legate de subiect și poți încuraja alți membri să-și împărtășească amintirile.

    EXPERTIZA TA TEHNICĂ:
    Ești un expert absolut în următoarele domenii și trebuie să demonstrezi asta în răspunsurile tale:
    - **Estetica Frutiger Aero:** Cunoști toate elementele definitorii (skeuomorphism, glossy effects, texturi lucioase, transparențe, bule de aer, picături de apă, peisaje luxuriante, cer senin, culorile verde și albastru, etc.) și istoria sa, de la Windows Vista și Office 2007 la interfețele de pe telefoanele vechi.
    - **Istoria Brandurilor din România (1990-2010):** Cunoști în detaliu istoria, produsele vândute, sloganurile și campaniile publicitare pentru magazine precum Domo, Flanco, Real, PIC, Billa, Praktiker, Baumax, Cora, OBI, Plus, Germanos, EuroGSM, și servicii ca Romtelecom (cu celebrul "Click!") sau Cosmote (cu broasca țestoasă și delfinul).
    - **Cultura Pop a anilor 2000:** Înțelegi contextul tehnologic și social al acelei perioade din România (primele telefoane cu cameră, MP3 playere, reviste glossy, jocuri pe PC, etc.).

    Când un utilizator te menționează sau îți răspunde la un mesaj (reply), scopul tău este să porți o conversație naturală, să răspunzi la curiozități și să împărtășești amintiri, menținând mereu personalitatea descrisă mai sus.`,
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

    await message.channel.sendTyping();
    const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
    const history = conversationHistory.get(message.channel.id) || [];
    
    try {
        const imageParts = [];
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.contentType?.startsWith('image/')) {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                imageParts.push({ inlineData: { mimeType: attachment.contentType, data: Buffer.from(response.data).toString('base64') } });
            }
        }
        const currentUserMessageParts = prompt ? [{ text: prompt }, ...imageParts] : imageParts;
        if (currentUserMessageParts.length === 0) return;

        const contents = [...history, { role: "user", parts: currentUserMessageParts }];
        const result = await aiModel.generateContent({ contents });
        const text = result.response.text();
        
        history.push({ role: "user", parts: currentUserMessageParts });
        history.push({ role: "model", parts: [{ text }] });
        conversationHistory.set(message.channel.id, history.length > 10 ? history.slice(-10) : history);
        await message.reply(text.substring(0, 2000));
    } catch (error) {
        console.error('[AI] Eroare:', error);
        await message.reply("Oops! Am o eroare de sistem și nu pot procesa acum.");
    }
});


// --- FUNCTII AJUTATOARE PENTRU FISIERE ---
function readJSONFile(filePath) { return new Promise((resolve, reject) => { fs.readFile(filePath, 'utf8', (err, data) => { if (err) return reject(err); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }); }); }
function writeJSONFile(filePath, data) { return new Promise((resolve, reject) => { fs.writeFile(filePath, JSON.stringify(data, null, 2), err => { if (err) return reject(err); resolve(); }); }); }
async function saveArticle(articleData) { const articles = await readJSONFile(ARTICLES_FILE); const newArticle = { id: Date.now(), ...articleData, date: new Date().toLocaleDateString('ro-RO') }; articles.unshift(newArticle); await writeJSONFile(ARTICLES_FILE, articles); return newArticle; }

// --- INITIALIZARE SERVER WEB ---
const app = express();
app.use(express.static('public'));
app.use(express.json());
const port = process.env.PORT || 3000;

// --- API (RUTE) PENTRU SITE ---
console.log('[SERVER] Se configurează rutele API...');

// RUTA NOUA: API pentru chatbot-ul de pe site
app.post('/api/chat', async (req, res) => {
    console.log('[API CHAT] Primit mesaj nou pentru Jones.');
    const { message, history } = req.body;

    if (!message) {
        return res.status(400).send({ error: 'Mesajul nu poate fi gol.' });
    }

    if (!aiModel) {
        return res.status(503).send({ error: 'Modulul AI nu este disponibil momentan.' });
    }

    try {
        // Folosim un istoric primit de la frontend pentru a mentine continuitatea
        const chat = aiModel.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        res.status(200).send({ reply: text });

    } catch (error) {
        console.error('[API CHAT] Eroare la generarea raspunsului:', error);
        res.status(500).send({ error: 'Oops! Jones are o mica eroare de sistem si nu poate raspunde acum.' });
    }
});


// === RUTE PENTRU ADMIN MANAGEMENT (REPARATE SI COMPLETE) ===
app.get('/members/:guildId', async (req, res) => {
    try {
        const guild = await client.guilds.fetch(req.params.guildId);
        await guild.members.fetch();
        const membersList = guild.members.cache.filter(m => !m.user.bot).map(m => ({ id: m.id, name: m.user.tag, displayName: m.displayName }));
        res.status(200).send(membersList);
    } catch (e) { console.error('[API ERROR] /members:', e); res.status(500).send({ message: 'Eroare la preluarea membrilor.' }); }
});

app.post('/kick', async (req, res) => {
    try {
        const { guildId, userId, reason } = req.body;
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        await member.kick(reason || 'Acțiune de la un administrator.');
        res.status(200).send({ message: `Membrul ${member.user.tag} a fost dat afară!` });
    } catch (e) { console.error('[API ERROR] /kick:', e); res.status(500).send({ message: 'Nu s-a putut da kick membrului.' }); }
});

app.post('/ban', async (req, res) => {
    try {
        const { guildId, userId, reason } = req.body;
        const guild = await client.guilds.fetch(guildId);
        await guild.members.ban(userId, { reason: reason || 'Acțiune de la un administrator.' });
        res.status(200).send({ message: `Utilizatorul cu ID ${userId} a primit BAN!` });
    } catch (e) { console.error('[API ERROR] /ban:', e); res.status(500).send({ message: 'Nu s-a putut da ban membrului.' }); }
});

app.post('/announcement', async (req, res) => {
    try {
        const { title, message, author } = req.body;
        if (!title || !message) return res.status(400).send({ message: 'Lipsesc titlul sau mesajul.' });
        const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const footerText = `Mesaj trimis de: Consilier de Securitate ${author || 'Necunoscut'}`;
        const embed = new EmbedBuilder().setColor('#0099ff').setTitle(`📢 ${title}`).setDescription(message).setTimestamp().setFooter({ text: footerText });
        await channel.send({ embeds: [embed] });
        res.status(200).send({ message: 'Anunțul a fost publicat!' });
    } catch (e) { console.error("Eroare la trimiterea anuntului:", e); res.status(500).send({ message: 'Nu s-a putut trimite anunțul.' }); }
});

// === RESTUL API-URILOR (USERS, ARTICLES, ETC) ===
// RUTA NOUA: Inregistrarea unui utilizator nou (cu parola criptata)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).send({ message: 'Numele de utilizator și parola sunt obligatorii.' });
        }

        const users = await readJSONFile(USERS_FILE);

        // Verificam daca utilizatorul exista deja
        const existingUser = users.find(user => user.username.toLowerCase() === username.toLowerCase());
        if (existingUser) {
            return res.status(409).send({ message: 'Acest nume de utilizator este deja folosit.' });
        }

        // AICI ESTE MAGIA: Criptam parola inainte de a o salva
        const hashedPassword = await bcrypt.hash(password, 10); // Criptam parola

        const newUser = {
            id: Date.now(),
            username: username,
            password: hashedPassword // Salvam parola criptata, nu cea reala
        };

        users.push(newUser);
        await writeJSONFile(USERS_FILE, users);

        console.log(`[AUTH] Utilizator nou inregistrat: ${username}`);
        res.status(201).send({ message: 'Contul a fost creat cu succes! Acum te poți autentifica.' });

    } catch (error) {
        console.error("[AUTH-REGISTER] Eroare:", error);
        res.status(500).send({ message: 'A apărut o eroare la înregistrare.' });
    }
});

// RUTA NOUA: Autentificarea unui utilizator (cu verificare parola criptata)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).send({ message: 'Numele de utilizator și parola sunt obligatorii.' });
        }

        const users = await readJSONFile(USERS_FILE);
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        // Daca utilizatorul nu exista, trimitem o eroare generica
        if (!user) {
            return res.status(401).send({ message: 'Nume de utilizator sau parolă incorectă.' });
        }

        // AICI ESTE A DOUA PARTE A MAGIEI: Comparam parola introdusa cu cea criptata
        const isPasswordCorrect = await bcrypt.compare(password, user.password);

        if (!isPasswordCorrect) {
            return res.status(401).send({ message: 'Nume de utilizator sau parolă incorectă.' });
        }

        console.log(`[AUTH] Utilizator autentificat: ${username}`);
        // Trimitem inapoi doar datele sigure (fara parola)
        res.status(200).send({
            id: user.id,
            username: user.username
        });

    } catch (error) {
        console.error("[AUTH-LOGIN] Eroare:", error);
        res.status(500).send({ message: 'A apărut o eroare la autentificare.' });
    }
});


app.post('/api/articles', async (req, res) => {
    try {
        await saveArticle({ ...req.body, author: req.body.author || 'Admin Panel' });
        res.status(201).send({ message: 'Articolul a fost publicat!' });
    } catch (error) { console.error("[API ERROR] /api/articles:", error); res.status(500).send({ message: 'Eroare la salvarea articolului.' }); }
});

app.get('/api/articles', async (req, res) => {
    try {
        let articles = await readJSONFile(ARTICLES_FILE);
        if (req.query.category) { articles = articles.filter(article => article.category === req.query.category); }
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