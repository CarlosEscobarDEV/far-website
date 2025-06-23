require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // Am adaugat axios pentru a descarca imagini

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

// --- GESTIONAREA MESAJELOR PENTRU AI (CU VIZIUNE) ---
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
    
    const promptText = message.content.replace(/<@!?\d+>/g, '').trim();
    const history = conversationHistory.get(message.channel.id) || [];
    
    try {
        const imageParts = [];
        // Verificam daca exista atasamente (imagini)
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            // Verificam daca atasamentul este o imagine
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                console.log(`[AI] Procesez imaginea: ${attachment.url}`);
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data, 'binary');
                
                imageParts.push({
                    inlineData: {
                        mimeType: attachment.contentType,
                        data: imageBuffer.toString('base64'),
                    },
                });
            }
        }
        
        // Construim promptul final, care poate include text si/sau imagini
        const finalPrompt = [
            { text: promptText },
            ...imageParts
        ];

        const chat = aiModel.startChat({ history });
        const result = await chat.generateContent({ contents: [{ role: "user", parts: finalPrompt }] });
        const text = result.response.text();
        
        // Actualizam istoricul conversatiei
        history.push({ role: "user", parts: [{ text: promptText }] }); // Salvam doar textul in istoric pentru simplitate
        history.push({ role: "model", parts: [{ text: text }] });
        conversationHistory.set(message.channel.id, history.length > 10 ? history.slice(-10) : history);

        await message.reply(text.substring(0, 2000));

    } catch (error) {
        console.error('[AI] Eroare la generarea raspunsului:', error);
        await message.reply("Oops! Am o mică eroare de sistem și nu pot procesa acum. Poate imaginea este prea complexă?");
    }
});


// --- INITIALIZARE SERVER WEB SI RESTUL API-URILOR ---
const app = express();
// ... (restul codului, care nu se schimba, ramane mai jos)
// ...
app.use(express.static('public'));
app.use(express.json());
const port = process.env.PORT || 3000;
function readJSONFile(filePath) { return new Promise((resolve, reject) => { fs.readFile(filePath, 'utf8', (err, data) => { if (err) return reject(err); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }); }); }
function writeJSONFile(filePath, data) { return new Promise((resolve, reject) => { fs.writeFile(filePath, JSON.stringify(data, null, 2), err => { if (err) return reject(err); resolve(); }); }); }
app.get('/members/:guildId', async (req, res) => {
    try {
        const guild = await client.guilds.fetch(req.params.guildId);
        await guild.members.fetch();
        const membersList = guild.members.cache.filter(m => !m.user.bot).map(m => ({ id: m.id, name: m.user.tag, displayName: m.displayName }));
        res.status(200).send(membersList);
    } catch (e) { res.status(500).send({ message: 'Eroare la preluarea membrilor.' }); }
});
app.post('/announcement', async (req, res) => {
    try {
        const { title, message, author } = req.body;
        if (!title || !message) return res.status(400).send({ message: 'Lipsesc titlul sau mesajul.' });
        const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        if (!channel) return res.status(404).send({ message: 'Canalul de anunturi nu a fost găsit.' });
        const footerText = `Mesaj trimis de: Consilier de Securitate ${author || 'Necunoscut'}`;
        const embed = new EmbedBuilder().setColor('#0099ff').setTitle(`📢 ${title}`).setDescription(message).setTimestamp().setFooter({ text: footerText });
        await channel.send({ embeds: [embed] });
        res.status(200).send({ message: 'Anunțul a fost publicat!' });
    } catch (e) {
        console.error("Eroare la trimiterea anuntului:", e);
        res.status(500).send({ message: 'Nu s-a putut trimite anunțul.' });
    }
});
// (Restul API-urilor raman la fel)
const start = async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        app.listen(port, () => console.log(`[SERVER] Serverul web ascultă pe portul ${port}`));
    } catch (error) {
        console.error("Eroare la pornirea aplicatiei:", error);
    }
};

start();