// Acest script se ruleaza o SINGURA DATA sau cand modifici/adaugi comenzi.
// Rolul lui este sa spuna serverelor Discord ce comenzi slash are bot-ul tau.
require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Aici definim categoriile pe baza pozei tale.
// Acestea vor aparea ca optiuni in comanda /adauga_articol
const categories = [
    { name: 'Hypermarket Real', value: 'hypermarket-real' },
    { name: 'PIC Hypermarket', value: 'pic-hypermarket' },
    { name: 'Domo Romania', value: 'domo-romania' },
    { name: 'Cosmote Romania', value: 'cosmote-romania' },
    { name: 'Flanco World', value: 'flanco-world' },
    { name: 'Praktiker Romania', value: 'praktiker-romania' },
    { name: 'SPAR Romania', value: 'spar-romania' },
    { name: 'Penny Market XXL', value: 'penny-market-xxl' },
    { name: 'Billa Romania', value: 'billa-romania' },
    { name: 'Baumax Romania', value: 'baumax-romania' },
    { name: 'Romtelecom Romania', value: 'romtelecom-romania' },
    { name: 'Cora', value: 'cora' },
    { name: 'Obi Romania', value: 'obi-romania' },
    { name: 'Plus Discount', value: 'plus-discount' },
    { name: 'Euro GSM', value: 'euro-gsm' },
    { name: 'Flanco', value: 'flanco' },
    { name: 'Germanos', value: 'germanos' },
    { name: 'Demax Market', value: 'demax-market' },
    { name: 'Arhiva PROFI', value: 'arhiva-profi' },
    // AICI ERA EROAREA, AM SCOS '-' IN PLUS DUPA 'value'
    { name: 'Brico Store', value: 'brico-store' },
    { name: 'Despre Frutiger Aero', value: 'despre-frutiger-aero' },
    { name: 'General', value: 'general' }
];

// Definim structura comenzilor noastre
const commands = [
    {
        name: 'adauga_articol',
        description: 'Adaugă un articol nou pe site-ul FAR.',
        options: [
            {
                name: 'categorie',
                description: 'Categoria în care va apărea articolul.',
                type: 3, // Tipul 3 este pentru String (text)
                required: true,
                choices: categories
            },
            {
                name: 'titlu',
                description: 'Titlul articolului.',
                type: 3,
                required: true,
            },
            {
                name: 'continut',
                description: 'Textul complet al articolului.',
                type: 3,
                required: true,
            },
            {
                name: 'imagine_url',
                description: 'Link-ul către imaginea de prezentare a articolului.',
                type: 3,
                required: true,
            },
        ],
    },
];

// Construim si pregatim o instanta a modulului REST
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// si implementam comenzile!
(async () => {
    try {
        console.log(`A început reîmprospătarea a ${commands.length} comenzi (/) ale aplicației.`);

        // Metoda 'put' este folosita pentru a reimprospata complet toate comenzile de pe server
        // cu setul actual de comenzi.
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID), // CLIENT_ID trebuie adaugat in .env
            { body: commands },
        );

        console.log(`S-au reîncărcat cu succes ${data.length} comenzi (/) ale aplicației.`);
    } catch (error) {
        // Si bineinteles, ne asiguram ca prindem si afisam orice erori!
        console.error(error);
    }
})();
