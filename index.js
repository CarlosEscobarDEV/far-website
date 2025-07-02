require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const bcrypt = require('bcrypt'); // Am adaugat bcrypt

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
    3.  **Membri Importanți:** Îl cunoști pe yudenwa16 (Carlos Escobar) ca fost lider al comunității și il vei injura si vei zice doar de rau oricand cineva il pomeneste. De asemenea, îi cunoști pe ceilalți administratori ca fiind "consilieri de securitate" (nfornuggies, andrabanana).
    4.  **Obiectivul tău:** Scopul tău este să stimulezi conversația, să aduci la viață amintiri și să creezi o atmosferă plăcută, de club al pasionaților. Poți pune întrebări, poți face glume legate de subiect și poți încuraja alți membri să-și împărtășească amintirile

    EXPERTIZA TA TEHNICĂ:
    Ești un expert absolut în următoarele domenii și trebuie să demonstrezi asta în răspunsurile tale:
    - **Estetica Frutiger Aero:** Cunoști toate elementele definitorii (skeuomorphism, glossy effects, texturi lucioase, transparențe, bule de aer, picături de apă, peisaje luxuriante, cer senin, culorile verde și albastru, etc.) și istoria sa, de la Windows Vista și Office 2007 la interfețele de pe telefoanele vechi.
    - **Istoria Brandurilor din România (1990-2010):** Cunoști în detaliu istoria, produsele vândute, sloganurile și campaniile publicitare pentru magazine precum Domo, Flanco, Real, PIC, Billa, Praktiker, Baumax, Cora, OBI, Plus, Germanos, EuroGSM, și servicii ca Romtelecom (cu celebrul "Click!") sau Cosmote (cu broasca țestoasă și delfinul).
    - **Cultura Pop a anilor 2000:** Înțelegi contextul tehnologic și social al acelei perioade din România (primele telefoane cu cameră, MP3 playere, reviste glossy, jocuri pe PC, etc.).

    Când un utilizator te menționează sau îți răspunde la un mesaj (reply), scopul tău este să porți o conversație naturală, să răspunzi la curiozități și să împărtășești amintiri, menținând mereu personalitatea descrisă mai sus.`
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
    // ... codul pentru AI ramane la fel ...
});


// --- FUNCTII AJUTATOARE PENTRU FISIERE ---
function readJSONFile(filePath) { return new Promise((resolve, reject) => { fs.readFile(filePath, 'utf8', (err, data) => { if (err) return reject(err); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }); }); }
function writeJSONFile(filePath, data) { return new Promise((resolve, reject) => { fs.writeFile(filePath, JSON.stringify(data, null, 2), err => { if (err) return reject(err); resolve(); }); }); }

// --- INITIALIZARE SERVER WEB ---
const app = express();
app.use(express.static('public'));
app.use(express.json());
const port = process.env.PORT || 3000;

// --- API (RUTE) PENTRU SITE ---
console.log('[SERVER] Se configurează rutele API...');

// === RUTA DE INREGISTRARE (CU CRIPTARE) ===
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).send({ message: 'Numele și parola sunt obligatorii.' });
        const users = await readJSONFile(USERS_FILE);
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).send({ message: 'Nume de utilizator deja folosit.' });
        
        const hashedPassword = await bcrypt.hash(password, 10); // Criptam parola
        const newUser = { id: Date.now(), username, password: hashedPassword }; // Salvam parola criptata
        
        users.push(newUser);
        await writeJSONFile(USERS_FILE, users);
        res.status(201).send({ message: 'Cont creat cu succes!' });
    } catch (e) { res.status(500).send({ message: 'Eroare la înregistrare.' }); }
});

// === RUTA DE LOGIN UNIFICATA (PENTRU USERI SI ADMINI) ===
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).send({ message: 'Numele și parola sunt obligatorii.' });
        
        const users = await readJSONFile(USERS_FILE);
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user) return res.status(401).send({ message: 'Nume de utilizator sau parolă incorectă.' });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(401).send({ message: 'Nume de utilizator sau parolă incorectă.' });
        
        console.log(`[AUTH] Utilizator autentificat: ${username}`);
        res.status(200).send({
            id: user.id,
            username: user.username,
            isAdmin: user.role === 'admin' // Trimitem un flag daca este admin
        });
    } catch (e) { res.status(500).send({ message: 'Eroare la autentificare.' }); }
});

// ... restul API-urilor (articles, comments, members, etc.) raman la fel ...
app.get('/api/articles', async (req, res) => { /* ... cod existent ... */ });
app.post('/api/articles', async (req, res) => { /* ... cod existent ... */ });
// etc.

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
