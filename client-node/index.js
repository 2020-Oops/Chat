const axios = require('axios');
const WebSocket = require('ws');
const readline = require('readline');

// URL вашого локального або задеплоєного API (Cloud Run)
// Наприклад: const API_URL = 'https://chat-server-xxxxxxxx-uc.a.run.app';
//            const WS_URL = 'wss://chat-server-xxxxxxxx-uc.a.run.app';
const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

let currentWs = null;
let currentUsername = '';

async function login(username, password) {
    try {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await axios.post(`${API_URL}/api/login`, formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data.access_token;
    } catch (error) {
        console.error("❌ Помилка входу:", error.response?.data?.detail || error.message);
        process.exit(1);
    }
}

async function register(username, password) {
    try {
        const response = await axios.post(`${API_URL}/api/register`, {
            username: username,
            password: password
        });
        if (response.status === 201) {
            console.log(`✅ Зареєстровано як '${username}'`);
        }
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log("ℹ️  Нікнейм зайнято, спробуємо увійти...");
        } else {
            console.error("❌ Помилка реєстрації:", error.response?.data || error.message);
        }
    }
}

function connectWebSocket(token, room) {
    const wsUrl = `${WS_URL}/ws/${room}?token=${token}`;
    console.log(`🔗 Підключення до #${room}...`);
    
    currentWs = new WebSocket(wsUrl);

    currentWs.on('open', () => {
        console.log(`✅ Підключено до кімнати #${room}. Введіть /exit для виходу, /history для історії, /name <новий> щоб змінити нік.`);
        startInputLoop();
    });

    currentWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            // Очищаємо поточний рядок вводу для виводу повідомлення
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            if (msg.type === 'message') {
                const ts = (msg.timestamp || '').substring(0, 16).replace('T', ' ');
                console.log(`[${ts}] ${msg.sender.username}: ${msg.content}`);
            } else if (msg.type === 'system') {
                console.log(`*** ${msg.content} ***`);
            } else if (msg.type === 'history') {
                console.log("--- Історія ---");
                (msg.messages || []).forEach(m => {
                    const ts = (m.timestamp || '').substring(0, 16).replace('T', ' ');
                    console.log(`  [${ts}] ${m.sender.username}: ${m.content}`);
                });
                console.log("--- Кінець ---");
            }
            
            // Повертаємо промпт
            rl.prompt(true);
        } catch (e) {
            // Ігноруємо помилки парсингу
        }
    });

    currentWs.on('close', () => {
        console.log("\n❌ З'єднання закрито.");
        process.exit(0);
    });

    currentWs.on('error', (err) => {
        console.error("\nWebSocket Error:", err.message);
    });
}

function startInputLoop() {
    rl.setPrompt(`${currentUsername}> `);
    rl.prompt();

    rl.on('line', (line) => {
        line = line.trim();
        if (!line) {
            rl.prompt();
            return;
        }

        if (line === '/exit') {
            console.log("Бувай!");
            if (currentWs) currentWs.close();
            process.exit(0);
        }

        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            currentWs.send(JSON.stringify({ content: line }));
        }
        
        rl.prompt();
    });
}

async function main() {
    console.log("=== Node.js Console Chat Client ===");
    const username = await askQuestion("Username: ");
    const password = await askQuestion("Password: ");
    let room = await askQuestion("Room (default: general): ");
    
    currentUsername = username.trim();
    if (!room.trim()) room = "general";

    await register(currentUsername, password.trim());
    const token = await login(currentUsername, password.trim());
    
    connectWebSocket(token, room.trim());
}

main();
