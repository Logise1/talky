import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// === FIREBASE CONFIG ===
const firebaseConfig = {
    apiKey: "AIzaSyCmIeRH5j1b3TdVQA6amPs67e2QqzIYXoI",
    authDomain: "spinshot-8d13d.firebaseapp.com",
    projectId: "spinshot-8d13d",
    storageBucket: "spinshot-8d13d.firebasestorage.app",
    messagingSenderId: "678712302906",
    appId: "1:678712302906:web:74efdc7dca6c2fb7c08403"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === APP CONFIG ===
const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

let userData = null;
let chatsData = null;
let memoriesData = {};
let talkyMeta = null;
let activeChatId = null;
let isAiTyping = false;
let aiLoopInterval = null;
let replyingTo = null;
let isRegisterMode = false;
let currentUser = null;
let dbUnsubscribe = null;

// === DOM ELEMENTS ===
const loginScreen = document.getElementById('login-screen');
const loadingScreen = document.getElementById('loading-screen');
const appScreen = document.getElementById('app-screen');

const loginForm = document.getElementById('login-form');
const authSwitch = document.getElementById('auth-switch');
const registerFields = document.getElementById('register-fields');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

const chatListContainer = document.getElementById('chat-list');
const chatHeader = document.querySelector('.chat-header');
const activeChatTitle = document.getElementById('active-chat-title');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatInputContainer = document.getElementById('chat-input-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const userDisplayName = document.getElementById('user-display-name');
const newGroupBtn = document.getElementById('new-group-btn');

// Reply elements
const replyPreviewContainer = document.getElementById('reply-preview-container');
const replyPreviewSender = document.getElementById('reply-preview-sender');
const replyPreviewText = document.getElementById('reply-preview-text');
const replyCancelBtn = document.getElementById('reply-cancel-btn');

// Memories elements
const memoriesBtn = document.getElementById('memories-btn');
const memoriesModal = document.getElementById('memories-modal');
const closeMemoriesBtn = document.getElementById('close-memories-btn');
const memoriesList = document.getElementById('memories-list');

// Profile elements
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const closeProfileBtn = document.getElementById('close-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const editName = document.getElementById('edit-name');
const editAge = document.getElementById('edit-age');
const editProfile = document.getElementById('edit-profile');

// Mobile elements
const sidebar = document.querySelector('.sidebar');
const mobileBackBtn = document.getElementById('mobile-back-btn');

// === AUTH & INITIALIZATION ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        showLoadingScreen();
        // Cargar datos de Firestore
        await loadUserDataFromFirestore(user.uid);
    } else {
        currentUser = null;
        if (dbUnsubscribe) {
            dbUnsubscribe();
            dbUnsubscribe = null;
        }
        showNextScreen(loginScreen);
    }
});

async function loadUserDataFromFirestore(uid) {
    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            userData = data.userData;
            talkyMeta = data.talkyMeta;
            chatsData = data.chatsData || {};
            memoriesData = data.memoriesData || {};

            applyMetaBackground();
            showAppScreen();

            // Listen for sync changes if you open another tab (optional but good practice)
            dbUnsubscribe = onSnapshot(userRef, (snapshot) => {
                const newData = snapshot.data();
                if (newData) {
                    if (newData.chatsData) chatsData = newData.chatsData;
                    if (newData.memoriesData) memoriesData = newData.memoriesData;
                    renderChatList();
                    if (activeChatId) renderMessages();
                }
            });
        } else {
            authError.textContent = "Datos no encontrados. Generando entorno...";
            authError.classList.remove('hidden');
            // Si no hay documento por alguna razón (y están logueados), regeneramos
            // esto no debería pasar desde la app porque se crea al registrarse, pero por si acaso:
            if (userData) {
                await generateInitialEnvironment(userData);
            } else {
                signOut(auth);
            }
        }
    } catch (err) {
        console.error("Error cargando Firestore:", err);
        showNextScreen(loginScreen);
        authError.textContent = "Error de base de datos.";
        authError.classList.remove('hidden');
    }
}

// === LOGIN/REGISTER UI ===
authSwitch.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
        registerFields.classList.remove('hidden');
        authBtn.textContent = 'Registrarse';
        authSwitch.innerHTML = '¿Ya tienes cuenta? <span>Inicia sesión</span>';

        // Hacer requeridos los campos de registro
        document.getElementById('name').required = true;
        document.getElementById('age').required = true;
        document.getElementById('profile').required = true;
    } else {
        registerFields.classList.add('hidden');
        authBtn.textContent = 'Entrar';
        authSwitch.innerHTML = '¿No tienes cuenta? <span>Regístrate aquí</span>';

        // Quitar requeridos
        document.getElementById('name').required = false;
        document.getElementById('age').required = false;
        document.getElementById('profile').required = false;
    }
    authError.classList.add('hidden');
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    authError.classList.add('hidden');

    if (isRegisterMode) {
        const name = document.getElementById('name').value.trim();
        const age = document.getElementById('age').value.trim();
        const profile = document.getElementById('profile').value.trim();

        if (!name || !age || !profile) {
            authError.textContent = "Rellena todos los campos.";
            authError.classList.remove('hidden');
            return;
        }

        try {
            showLoadingScreen();
            userData = { name, age, profile };

            // 1. Create auth user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            currentUser = userCredential.user;

            // 2. Generate initial chats with Mistral
            await generateInitialEnvironment(userData);

        } catch (error) {
            console.error("Error registrando:", error);
            showNextScreen(loginScreen);
            authError.textContent = error.message;
            authError.classList.remove('hidden');
        }
    } else {
        // Login
        try {
            showLoadingScreen();
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged will handle the rest
        } catch (error) {
            console.error("Error login:", error);
            showNextScreen(loginScreen);
            authError.textContent = "Email o contraseña incorrectos.";
            authError.classList.remove('hidden');
        }
    }
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// === LOGIC ===
function applyMetaBackground() {
    if (talkyMeta && talkyMeta.background) {
        document.querySelector('.chat-area').style.background = talkyMeta.background;
    }
}

function showNextScreen(screen) {
    loginScreen.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    appScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

function showLoadingScreen() {
    showNextScreen(loadingScreen);
}

function showAppScreen() {
    userDisplayName.textContent = `Hola, ${userData.name}`;
    renderChatList();
    showNextScreen(appScreen);
    startAiLoop();
}

async function generateInitialEnvironment(user) {
    const prompt = `
Eres el motor de inicialización de un simulador de chat tipo WhatsApp.
El usuario principal se llama "${user.name}", tiene ${user.age} años y se describe así: "${user.profile}".

Debes generar el entorno inicial. Se acaba de unir a un grupo y no conoce a nadie. Extrae 4 amigos imaginarios, un fondo para el chat y un historial inicial de mensajes.
Devuelve EXACTAMENTE Y ÚNICAMENTE un JSON con el siguiente formato, sin bloques de código markdown:
{
  "characters": ["Nombre1", "Nombre2", "Nombre3", "Nombre4"],
  "background": "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
  "chats": {
    "Grupo de clase": [
      {"sender": "Nombre1", "message": "quien es el nuevo?"},
      {"sender": "Nombre2", "message": "holaa que tal?"},
      {"sender": "Nombre3", "message": "de donde eres??"}
    ]
  }
}

REGLAS INFLEXIBLES:
1. En "chats", solo debe haber UNA clave llamada "Grupo de clase". No crees chats individuales aquí.
2. El chat "Grupo de clase" debe contener de 4 a 8 mensajes seguidos simulando que la gente bombardea al usuario (${user.name}) a preguntas sobre sus gustos, de dónde es, etc. dado que es nuevo en el grupo.
3. El usuario (${user.name}) NO debe hablar en este historial inicial, solo recibe el bombardeo de los demás personajes.
4. DEBES adaptar estrictamente la forma de hablar (ortografía, jerga, abreviaturas) a los ${user.age} años.
5. Los mensajes DEBEN SER MUY CORTOS (1 a 10 palabras máximo).
6. El "background" debe ser un fondo de color oscuro y moderno.
`;

    try {
        const responseData = await fetch(MISTRAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-medium-latest",
                messages: [
                    { role: "system", content: "Solo devuelves JSON puro. Nada de texto extra." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.8
            })
        });

        if (!responseData.ok) throw new Error("Error API de Mistral.");
        const data = await responseData.json();
        const parsed = parseAIResponse(data.choices[0].message.content);

        if (parsed && parsed.characters && parsed.chats) {
            talkyMeta = {
                classmates: parsed.characters,
                background: parsed.background || "linear-gradient(135deg, #0b141a, #111b21)"
            };

            chatsData = {};
            const groupMembers = [...parsed.characters, user.name];

            chatsData["Grupo de clase"] = {
                type: "group",
                members: groupMembers,
                messages: parsed.chats["Grupo de clase"] || [],
                unreadCount: parsed.chats["Grupo de clase"].length || 0 // Simulate initial unreads!
            };

            parsed.characters.forEach(char => {
                chatsData[char] = {
                    type: "individual",
                    members: [char, user.name],
                    messages: [],
                    unreadCount: 0
                };
            });

            // Guardar a Firestore en un único bloque de documento
            await setDoc(doc(db, "users", currentUser.uid), {
                userData: userData,
                talkyMeta: talkyMeta,
                chatsData: chatsData,
                memoriesData: memoriesData
            });

            applyMetaBackground();
            showAppScreen();
        } else {
            throw new Error("Formato JSON incorrecto devuelto por Mistral.");
        }
    } catch (error) {
        console.error("Generación Inicial Falló:", error);
        authError.textContent = "Fallo en IA. Intentalo de nuevo.";
        authError.classList.remove('hidden');
        signOut(auth);
        showNextScreen(loginScreen);
    }
}

// === NEW GROUP ===
newGroupBtn.addEventListener('click', () => {
    const groupName = prompt("Nombre del nuevo grupo:");
    if (groupName && groupName.trim() !== '') {
        const nameClean = groupName.trim();
        if (!chatsData[nameClean]) {
            chatsData[nameClean] = {
                type: "group",
                members: [...talkyMeta.classmates, userData.name],
                messages: [{ sender: "Sistema", message: `Has creado el grupo "${nameClean}"` }],
                unreadCount: 0
            };
            saveChatsToFirestore();
            renderChatList();
            openChat(nameClean);
        } else {
            alert("Ese chat ya existe.");
        }
    }
});

// === RENDER CHATS ===
function renderChatList() {
    chatListContainer.innerHTML = '';

    Object.keys(chatsData).forEach(chatId => {
        const chat = chatsData[chatId];
        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : { message: 'Sin mensajes aún' };

        const chatEl = document.createElement('div');
        chatEl.className = `chat-item ${activeChatId === chatId ? 'active' : ''}`;
        chatEl.onclick = () => openChat(chatId);

        let prefix = '';
        if (lastMsg.sender && lastMsg.sender !== userData.name && chat.type === 'group' && lastMsg.sender !== 'Sistema') {
            prefix = `${lastMsg.sender}: `;
        } else if (lastMsg.sender === userData.name) {
            prefix = 'Tú: ';
        }

        const unreadCount = chat.unreadCount || 0;
        const unreadBadge = unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : '';

        chatEl.innerHTML = `
            <div class="chat-item-content">
                <div class="chat-item-name">${chatId}</div>
                <div class="chat-item-last-msg">${prefix}${lastMsg.message}</div>
            </div>
            ${unreadBadge}
        `;

        chatListContainer.appendChild(chatEl);
    });
}

function openChat(chatId) {
    activeChatId = chatId;
    if (chatsData[chatId]) {
        chatsData[chatId].unreadCount = 0;
        saveChatsToFirestore();
    }
    cancelReply();
    renderChatList();

    chatHeader.classList.remove('hidden');
    chatInputContainer.classList.remove('hidden');
    activeChatTitle.textContent = chatId;

    // Mobile slide effect
    if (window.innerWidth <= 768) {
        sidebar.classList.add('chat-active');
    }

    chatMessagesContainer.innerHTML = ''; // Force clear on switch
    renderMessages();
}

if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
        sidebar.classList.remove('chat-active');
        activeChatId = null;
        renderChatList();
    });
}

function createMessageElement(msg, chatType) {
    const isSentByMe = msg.sender === userData.name;
    const msgEl = document.createElement('div');

    if (msg.sender === "Sistema") {
        msgEl.className = 'message system-message';
        msgEl.innerHTML = `<em>${msg.message}</em>`;
    } else {
        msgEl.className = `message ${isSentByMe ? 'sent' : 'received'}`;

        let replyPrefix = '';
        if (msg.replyTo) {
            replyPrefix = `
            <div class="replied-message">
                <div class="replied-sender">${msg.replyTo.sender}</div>
                <div class="replied-text">${msg.replyTo.message}</div>
            </div>`;
        }

        let senderHtml = '';
        if (!isSentByMe && chatType === "group") {
            senderHtml = `<span class="msg-sender">${msg.sender}</span>`;
        }

        const safeSender = msg.sender.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeMsg = msg.message.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        const replyBtnHtml = `<div class="reply-btn" title="Responder" onclick="window.startReply('${safeSender}', '${safeMsg}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>`;

        msgEl.innerHTML = `${replyBtnHtml}${replyPrefix}${senderHtml} ${msg.message}`;
    }
    return msgEl;
}

function renderMessages() {
    if (!activeChatId) return;

    // In mobile show the back button
    if (window.innerWidth <= 768 && mobileBackBtn) {
        mobileBackBtn.style.display = 'flex';
    } else if (mobileBackBtn) {
        mobileBackBtn.style.display = 'none';
    }

    const chat = chatsData[activeChatId];

    if (chat.messages.length === 0) {
        chatMessagesContainer.innerHTML = '<div class="empty-state">Inicia la conversación</div>';
        return;
    }

    const currentElements = chatMessagesContainer.querySelectorAll('.message, .empty-state');
    const hasEmptyState = chatMessagesContainer.querySelector('.empty-state');

    // Re-render full
    if (currentElements.length > chat.messages.length || hasEmptyState) {
        chatMessagesContainer.innerHTML = '';
        chat.messages.forEach(msg => {
            chatMessagesContainer.appendChild(createMessageElement(msg, chat.type));
        });
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        return;
    }

    // Incremental append
    let appended = false;
    for (let i = currentElements.length; i < chat.messages.length; i++) {
        chatMessagesContainer.appendChild(createMessageElement(chat.messages[i], chat.type));
        appended = true;
    }

    if (appended) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
}

// === EXPOSE TO WINDOW FOR INLINE CLICKS ===
window.startReply = function (sender, message) {
    replyingTo = { sender, message };
    replyPreviewSender.textContent = sender;
    replyPreviewText.textContent = message;
    replyPreviewContainer.classList.remove('hidden');
    messageInput.focus();
}

function cancelReply() {
    replyingTo = null;
    replyPreviewContainer.classList.add('hidden');
}

if (replyCancelBtn) replyCancelBtn.addEventListener('click', cancelReply);

// === MESSAGING ===
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatId) return;

    messageInput.value = '';

    const newMsg = {
        sender: userData.name,
        message: text,
        timestamp: new Date().toISOString()
    };

    if (replyingTo) {
        newMsg.replyTo = { ...replyingTo };
        cancelReply();
    }

    chatsData[activeChatId].messages.push(newMsg);

    saveChatsToFirestore();
    renderMessages();
    renderChatList();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// === FIREBASE SYNC ===
async function saveChatsToFirestore() {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            chatsData: chatsData,
            memoriesData: memoriesData
        });
    } catch (e) {
        console.error("Error saving to Firestore", e);
    }
}

// === AI LOGIC ===
function startAiLoop() {
    if (aiLoopInterval) clearInterval(aiLoopInterval);

    const scheduleNextAiAction = () => {
        const randomTime = Math.floor(Math.random() * 10000) + 8000;
        aiLoopInterval = setTimeout(async () => {
            if (currentUser) {
                await triggerAiSimulation();
            }
            scheduleNextAiAction();
        }, randomTime);
    };

    scheduleNextAiAction();
}

async function triggerAiSimulation() {
    if (isAiTyping || !talkyMeta) return;
    isAiTyping = true;

    try {
        const prompt = buildAiPrompt();
        const responseData = await fetch(MISTRAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-medium-latest",
                messages: [
                    { role: "system", content: "Eres el motor lógico de un simulador de WhatsApp. Devuelves estrictamente JSON puro (sin bloques markdown)." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.8
            })
        });

        if (!responseData.ok) throw new Error("Error en la API de Mistral.");

        const data = await responseData.json();
        const aiMessage = data.choices[0].message.content;

        const parsed = parseAIResponse(aiMessage);

        if (parsed && parsed.messages && Array.isArray(parsed.messages)) {
            enqueueMessages(parsed.messages);
        } else if (parsed && parsed.chat && parsed.member && parsed.message) {
            enqueueMessages([parsed]);
        }
    } catch (err) {
        console.error("AI Error:", err);
    } finally {
        isAiTyping = false;
    }
}

function buildAiPrompt() {
    let contextStr = `ESTADO DE LOS CHATS:\n`;
    Object.keys(chatsData).forEach(chatId => {
        const chat = chatsData[chatId];
        const recentMsgs = chat.messages.slice(-5).map(m => `[${m.sender}]: ${m.message}`).join("\n");
        contextStr += `- Chat: "${chatId}" (${chat.type})\n  Historial reciente:\n${recentMsgs ? recentMsgs : '  (Vacio)'}\n\n`;
    });

    let memoriesStr = "MEMORIAS (Lo que saben de ti):\n";
    if (Object.keys(memoriesData).length === 0) memoriesStr += "- Nada aún.\n";
    for (let char in memoriesData) {
        if (memoriesData[char].length > 0) {
            memoriesStr += `- ${char} sabe: ${memoriesData[char].join(", ")}\n`;
        }
    }

    return `
Eres un grupo de amigos de ${userData.age} años hablando por WhatsApp con ${userData.name}.
Personajes disponibles: ${talkyMeta.classmates.join(", ")}.

Tu tarea: Decide si alguno o varios amigos envían mensajes ahora mismo.

Instrucciones estrictas:
- Devuelve EXACTAMENTE un JSON puro con un array llamado "messages" (SIN bloques markdown).
- En cada objeto del array "messages" asógnale un "chat", "member", "message", y opcionalmente "delay" (milisegundos, ej: 1000).
- OPCIONALMENTE, si un bot está respondiendo a un mensaje concreto, añade al objeto la clave "replyTo" con este formato: "replyTo": {"sender": "Nombre a quien responde", "message": "Texto que responde"}.
- OJO: Ahora puedes generar nuevas memorias sobre el usuario. Si el usuario te cuenta algo importante (donde vive, que le gusta hacer, una mania, etc), puedes añadir a ESE objeto "message" una clave más: "newMemory" con un string de 3-5 palabras descriptivo (Ej: "newMemory": "Tiene perro llamado Toby").
- A VECES devuelve 1 mensaje, pero OTRAS VECES (al azar, especialmente cuando responden a algo) simula un ESTALLIDO de notificaciones devolviendo 3, 4 o 5 mensajes cortos seguidos (de uno o varios personajes) separados por delays de 500-2000ms.
- FRASES MUY CORTAS. MÁXIMO 8 PALABRAS.
- SIN NADA DE MARKDOWN (ni negritas ni cursivas).
- SOLO A VECES usa un (1) emoji, casi siempre debe ser texto plano y veloz.
- Uso de jerga según la edad (${userData.age}). Usa las memorias si son relevantes al contexto actual.
- NUNCA, BAJO NINGUNA CIRCUNSTANCIA, envíes un mensaje en nombre del usuario ("${userData.name}"). Todos los mensajes en "member" DEBEN ser de alguno de los Personajes disponibles. NUNCA del usuario.

Ejemplo: {"messages": [{"chat": "Grupo de clase", "member": "${talkyMeta.classmates[0]}", "message": "q dices loco", "delay": 500, "newMemory": "Le gusta el rap"}, {"chat": "Grupo de clase", "member": "${talkyMeta.classmates[1]}", "message": "no m jodas", "delay": 2000}]}

${memoriesStr}

${contextStr}

Si el chat está tranquilo o nadie debe hablar ahora, devuelve: {"messages": []}
    `;
}

function parseAIResponse(text) {
    try {
        let clean = text.trim();
        if (clean.startsWith('\`')) {
            clean = clean.replace(/\`\`\`json/gi, '').replace(/\`\`\`/gi, '').trim();
        }
        return JSON.parse(clean);
    } catch (e) {
        console.error("Failed to parse JSON from AI", text);
        return null;
    }
}

let messageQueue = [];
let isProcessingQueue = false;

function enqueueMessages(messages) {
    messageQueue.push(...messages);
    processQueue();
}

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const action = messageQueue.shift();
        handleAiAction(action);
        await new Promise(resolve => setTimeout(resolve, 2500)); // Queue each message 2.5s apart
    }

    isProcessingQueue = false;
}

let beepAudioCtx = null;
function playNotificationSound() {
    try {
        if (!beepAudioCtx) beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (beepAudioCtx.state === 'suspended') beepAudioCtx.resume();
        const oscillator = beepAudioCtx.createOscillator();
        const gainNode = beepAudioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(587.33, beepAudioCtx.currentTime); // D5
        oscillator.frequency.exponentialRampToValueAtTime(880, beepAudioCtx.currentTime + 0.1); // A5
        gainNode.gain.setValueAtTime(0.05, beepAudioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, beepAudioCtx.currentTime + 0.15);
        oscillator.connect(gainNode);
        gainNode.connect(beepAudioCtx.destination);
        oscillator.start();
        oscillator.stop(beepAudioCtx.currentTime + 0.2);
    } catch (e) {
        console.error("Audio beep failed", e);
    }
}

function handleAiAction(action) {
    const { chat, member, message, replyTo, newMemory } = action;

    if (chat && member && message && chatsData[chat] && message.trim() !== '') {
        const newMsg = {
            sender: member,
            message: message,
            timestamp: new Date().toISOString()
        };

        if (replyTo && replyTo.sender && replyTo.message) {
            newMsg.replyTo = replyTo;
        }

        // Handle memory storage
        if (newMemory) {
            if (!memoriesData[member]) memoriesData[member] = [];
            memoriesData[member].push(newMemory);
            renderMemories();
        }

        chatsData[chat].messages.push(newMsg);

        saveChatsToFirestore();

        if (activeChatId === chat) {
            renderMessages();
        } else {
            chatsData[chat].unreadCount = (chatsData[chat].unreadCount || 0) + 1;
            playNotificationSound();
        }
        renderChatList();
    }
}

// === MEMORIES UI ===
memoriesBtn.addEventListener('click', () => {
    renderMemories();
    memoriesModal.classList.remove('hidden');
});

closeMemoriesBtn.addEventListener('click', () => {
    memoriesModal.classList.add('hidden');
});

function renderMemories() {
    memoriesList.innerHTML = '';
    let hasMemories = false;

    for (let char in memoriesData) {
        if (memoriesData[char].length > 0) {
            hasMemories = true;
            const block = document.createElement('div');
            block.style.background = 'rgba(255,255,255,0.05)';
            block.style.padding = '1rem';
            block.style.borderRadius = '8px';
            block.innerHTML = `
                <h4 style="color: #38bdf8; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    Memoria de ${char}
                </h4>
                <ul style="list-style-type: none; padding-left: 0.5rem; color: #cbd5e1; font-size: 0.9rem;">
                    ${memoriesData[char].map(m => `<li style="margin-bottom: 0.25rem;">• ${m}</li>`).join('')}
                </ul>
            `;
            memoriesList.appendChild(block);
        }
    }

    if (!hasMemories) {
        memoriesList.innerHTML = '<p style="color: #64748b; text-align: center; margin-top: 2rem;">Aún no tienen ninguna memoria de ti. ¡Cuéntales cosas sobre ti o tus gustos!</p>';
    }
}

// === PROFILE UI ===
if (profileBtn) {
    profileBtn.addEventListener('click', () => {
        editName.value = userData.name;
        editAge.value = userData.age;
        editProfile.value = userData.profile;
        profileModal.classList.remove('hidden');
    });
}

if (closeProfileBtn) {
    closeProfileBtn.addEventListener('click', () => {
        profileModal.classList.add('hidden');
    });
}

if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        const name = editName.value.trim();
        const age = editAge.value.trim();
        const profile = editProfile.value.trim();

        if (name && age && profile) {
            userData = { name, age, profile };
            userDisplayName.textContent = `Hola, ${userData.name}`;

            if (currentUser) {
                try {
                    await updateDoc(doc(db, "users", currentUser.uid), {
                        userData: userData
                    });
                } catch (e) {
                    console.error("Error updating profile", e);
                }
            }
            profileModal.classList.add('hidden');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // onAuthStateChanged se encarga de mostrar la pantalla de carga,
    // nosotros solo mostramos login por defecto si no hay Firebase cache
    if (!currentUser) {
        showNextScreen(loginScreen);
    }
});
