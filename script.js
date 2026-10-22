// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBYu3sdFdEf4XucQFtWVRJbEcLGPAjcD6w",
    authDomain: "reseller-smm-panel.firebaseapp.com",
    projectId: "reseller-smm-panel",
    storageBucket: "reseller-smm-panel.firebasestorage.app",
    messagingSenderId: "436538537782",
    appId: "1:436538537782:web:0c6f87e1fe693a7edf2597"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
const OWNER_EMAIL = "skrboss906@gmail.com";
let currentUser = null;
let qrTimer = null;

// DOM Elements
const loginPage = document.getElementById('loginPage');
const userPanel = document.getElementById('userPanel');
const adminPanel = document.getElementById('adminPanel');

// Auth Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        // Check Ban Status
        if (userDoc.exists && userDoc.data().isBanned) {
            showToast("Your account has been Banned!");
            auth.signOut();
            return;
        }

        // Initialize User in Firestore if not present
        if (!userDoc.exists) {
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                balance: 0,
                isBanned: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Route Panels
        if (user.email === OWNER_EMAIL) {
            showPage(adminPanel);
            loadAdminData();
        } else {
            showPage(userPanel);
            listenUserData(user.uid);
        }
    } else {
        currentUser = null;
        showPage(loginPage);
    }
});

// Google Login
document.getElementById('googleLoginBtn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => showToast(err.message));
});

function logout() {
    auth.signOut();
}

// UI Page View Transition
function showPage(pageElem) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    pageElem.classList.add('active');
}

function switchTab(tabId) {
    document.querySelectorAll('#userPanel .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#userPanel .tab-content').forEach(content => content.classList.remove('active-tab'));
    
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.add('active-tab');
}

function switchAdminTab(tabId) {
    document.querySelectorAll('#adminPanel .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active-tab'));
    
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.add('active-tab');
}

function switchPaymentMethod(method) {
    document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
    if (method === 'upi') {
        document.getElementById('methodUpiBtn').classList.add('active');
        document.getElementById('upiPaymentBox').classList.remove('hidden');
        document.getElementById('redeemPaymentBox').classList.add('hidden');
    } else {
        document.getElementById('methodRedeemBtn').classList.add('active');
        document.getElementById('upiPaymentBox').classList.add('hidden');
        document.getElementById('redeemPaymentBox').classList.remove('hidden');
    }
}

// User Data Sync
function listenUserData(uid) {
    db.collection('users').doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            document.getElementById('userBalance').innerText = doc.data().balance.toFixed(2);
        }
    });
}

// Service Calculator
function calculatePrice() {
    const select = document.getElementById('serviceSelect');
    const rate = parseFloat(select.options[select.selectedIndex].dataset.rate);
    const quantity = parseInt(document.getElementById('quantityInput').value) || 0;
    
    const total = (quantity / 100) * rate;
    document.getElementById('totalPrice').innerText = total.toFixed(2);
}

// Order Submission & Telegram Integration
document.getElementById('orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const serviceSelect = document.getElementById('serviceSelect');
    const serviceName = serviceSelect.options[serviceSelect.selectedIndex].text;
    const serviceType = serviceSelect.value;
    const url = document.getElementById('targetUrl').value;
    const quantity = parseInt(document.getElementById('quantityInput').value);
    const totalPrice = parseFloat(document.getElementById('totalPrice').innerText);

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const currentBalance = userDoc.data().balance;

    if (currentBalance < totalPrice) {
        showToast("Insufficient Balance! Please Add Funds.");
        return;
    }

    // Deduct Balance
    await db.collection('users').doc(currentUser.uid).update({
        balance: currentBalance - totalPrice
    });

    // Record Order
    await db.collection('orders').add({
        uid: currentUser.uid,
        userEmail: currentUser.email,
        service: serviceType,
        url: url,
        quantity: quantity,
        price: totalPrice,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Send Telegram Notification
    sendTelegramNotification(serviceType, serviceName, url, quantity, currentUser.email);

    showToast("Order Placed Successfully!");
    document.getElementById('orderForm').reset();
    calculatePrice();
});

async function sendTelegramNotification(type, serviceName, url, quantity, email) {
    const envDoc = await db.collection('config').doc('env').get();
    if (!envDoc.exists) return;
    
    const { botToken, chatId } = envDoc.data();
    if (!botToken || !chatId) return;

    const message = `🚀 *NEW ORDER RECEIVED*\n\n` +
                    `👤 *User:* ${email}\n` +
                    `📌 *Service:* ${serviceName} (${type.toUpperCase()})\n` +
                    `🔗 *URL:* ${url}\n` +
                    `🔢 *Quantity:* ${quantity}`;

    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        })
    });
}

// Dynamic Dynamic UPI QR Code Engine
function generateUPIQR() {
    const amount = document.getElementById('upiAmount').value;
    if (!amount || amount <= 0) {
        showToast("Enter a valid amount!");
        return;
    }

    const upiID = "9831375819@axl";
    const name = "KABIR SEKH";
    const upiURI = `upi://pay?pa=${upiID}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;

    const qrContainer = document.getElementById('qrCanvas');
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: upiURI,
        width: 180,
        height: 180
    });

    document.getElementById('qrDisplayArea').classList.remove('hidden');
    startTimer(300); // 5 Minutes
}

function startTimer(seconds) {
    clearInterval(qrTimer);
    let time = seconds;
    qrTimer = setInterval(() => {
        let m = Math.floor(time / 60);
        let s = time % 60;
        document.getElementById('timerCountdown').innerText = 
            `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        
        if (--time < 0) {
            clearInterval(qrTimer);
            document.getElementById('qrDisplayArea').classList.add('hidden');
            showToast("QR Code Expired. Please Generate Again.");
        }
    }, 1000);
}

// Payment Verification with Server Simulation & OCR Reader
async function verifyAndSubmitPayment() {
    const utr = document.getElementById('utrNumber').value.trim();
    const fileInput = document.getElementById('paymentScreenshot');

    if (!utr || fileInput.files.length === 0) {
        showToast("Please provide UTR and Screenshot!");
        return;
    }

    showToast("Processing Payment Screenshot Verification...");

    const file = fileInput.files[0];
    
    // OCR Extraction using Tesseract
    Tesseract.recognize(file, 'eng').then(async ({ data: { text } }) => {
        const textUpper = text.toUpperCase();

        // Check Receiver Name & UPI ID
        const nameValid = textUpper.includes("KABIR SEKH") || textUpper.includes("KABIR");
        const upiValid = textUpper.includes("9831375819@AXL") || textUpper.includes("9831375819");
        const utrValid = text.includes(utr);

        if (!nameValid || !upiValid) {
            showToast("Payment Failed: Invalid Beneficiary/UPI ID Detected!");
            return;
        }

        if (!utrValid) {
            showToast("Payment Failed: Provided UTR does not match Screenshot!");
            return;
        }

        // Check Duplicate UTR in Database
        const utrCheck = await db.collection('payments').where('utr', '==', utr).get();
        if (!utrCheck.empty) {
            showToast("Payment Failed: UTR already used!");
            return;
        }

        // Success: Add Funds to User Balance
        const amount = parseFloat(document.getElementById('upiAmount').value);
        const userRef = db.collection('users').doc(currentUser.uid);
        
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const newBal = (userDoc.data().balance || 0) + amount;
            transaction.update(userRef, { balance: newBal });
        });

        // Save Transaction Record
        await db.collection('payments').add({
            uid: currentUser.uid,
            utr: utr,
            amount: amount,
            status: 'SUCCESS',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast("Payment Verified! Balance Added Successfully.");
        document.getElementById('qrDisplayArea').classList.add('hidden');
        clearInterval(qrTimer);
    }).catch(err => {
        showToast("OCR Verification Error. Try uploading clearer image.");
    });
}

// Redeem Code Processing
async function claimRedeemCode() {
    const code = document.getElementById('redeemInput').value.trim();
    if (!code) return showToast("Enter Redeem Code!");

    const codeRef = db.collection('redeemCodes').doc(code);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) {
        showToast("Invalid Redeem Code!");
        return;
    }

    const data = codeDoc.data();
    if (data.isUsed) {
        showToast("This Redeem Code has already been used!");
        return;
    }

    // Add Balance & Mark Expired
    await db.collection('users').doc(currentUser.uid).update({
        balance: firebase.firestore.FieldValue.increment(data.amount)
    });

    await codeRef.update({
        isUsed: true,
        usedBy: currentUser.email,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast(`Successfully Added ₹${data.amount} to your wallet!`);
    document.getElementById('redeemInput').value = "";
}

function getRedeemCodeWhatsApp() {
    const phone = "919831375819";
    const msg = encodeURIComponent("I WANT TO GET REDEEM CODE");
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

// ADMIN FUNCTIONS
function loadAdminData() {
    // Users List
    db.collection('users').onSnapshot(snapshot => {
        const tbody = document.getElementById('userTableBody');
        tbody.innerHTML = "";
        document.getElementById('totalUsersCount').innerText = snapshot.size;

        snapshot.forEach(doc => {
            const u = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.email}</td>
                <td>₹${(u.balance || 0).toFixed(2)}</td>
                <td>${u.isBanned ? '<span style="color:red">Banned</span>' : '<span style="color:green">Active</span>'}</td>
                <td>
                    <button class="action-btn ${u.isBanned ? 'btn-unban' : 'btn-ban'}" 
                        onclick="toggleBanUser('${doc.id}', ${u.isBanned})">
                        ${u.isBanned ? 'Unban' : 'Ban'}
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });

    // Orders Count
    db.collection('orders').onSnapshot(snap => {
        document.getElementById('totalOrdersCount').innerText = snap.size;
    });

    // Load ENV Values
    db.collection('config').doc('env').get().then(doc => {
        if (doc.exists) {
            document.getElementById('botTokenInput').value = doc.data().botToken || "";
            document.getElementById('chatIdInput').value = doc.data().chatId || "";
        }
    });
}

async function toggleBanUser(uid, currentStatus) {
    await db.collection('users').doc(uid).update({ isBanned: !currentStatus });
    showToast("User status updated!");
}

async function generateRedeemCode() {
    const amount = parseFloat(document.getElementById('codeAmountInput').value);
    if (!amount || amount <= 0) return showToast("Enter valid amount!");

    // Generate 15-Digit Random Unique Code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let raw = '';
    for (let i = 0; i < 15; i++) {
        raw += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await db.collection('redeemCodes').doc(raw).set({
        amount: amount,
        isUsed: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const display = document.getElementById('generatedCodeDisplay');
    display.innerText = `Code: ${raw} (₹${amount})`;
    display.classList.remove('hidden');
    showToast("Redeem Code Generated Successfully!");
}

async function saveEnvSettings() {
    const botToken = document.getElementById('botTokenInput').value.trim();
    const chatId = document.getElementById('chatIdInput').value.trim();

    await db.collection('config').doc('env').set({
        botToken: botToken,
        chatId: chatId
    }, { merge: true });

    showToast("ENV Configuration Saved Successfully!");
}

// Toast System
function showToast(text) {
    const toast = document.getElementById('toast');
    toast.innerText = text;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3500);
}