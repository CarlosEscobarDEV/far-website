// Acest script este un utilitar. Il rulezi o singura data pentru a genera parolele criptate.
const bcrypt = require('bcrypt');

// Lista de admini si parolele lor in clar
const admins = [
    { username: 'yudenwa16', password: 'antemie1' },
    { username: 'andrabanana', password: '010R1' },
    { username: 'nfornuggies', password: '22o102Y' },
    { username: 'skittle', password: 'skt10023' },
    { username: 'kinkrar', password: 'antemie1122' }
];

async function hashPasswords() {
    console.log("--- Parole Criptate pentru Admini ---");
    console.log("Copiaza obiectele de mai jos si adauga-le in fisierul 'users.json'");

    const hashedAdmins = [];

    for (const admin of admins) {
        // Criptam fiecare parola
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        
        // Cream un obiect nou cu parola criptata si un rol special
        hashedAdmins.push({
            id: `admin_${Date.now()}_${Math.random()}`, // ID unic
            username: admin.username,
            password: hashedPassword, // Parola criptata
            role: 'admin' // Rol special pentru a-i diferentia
        });
    }

    // Afisam rezultatul in format JSON pentru a fi usor de copiat
    console.log(JSON.stringify(hashedAdmins, null, 2));
    console.log("\n--- Gata! ---");
}

hashPasswords();