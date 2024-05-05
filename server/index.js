// Servidor Intermediario
import express from 'express';
import logger from 'morgan';
import { Server } from 'socket.io';
import { createServer } from 'http';
import net from 'net';
import dotenv from 'dotenv'
import { createClient } from '@libsql/client';

dotenv.config()

const port = process.env.PORT ?? 8000;

const app = express();
const server = createServer(app);
const io = new Server(server,{
    connectionStateRecovery: {}
});

const db = createClient({
    url: "libsql://harmless-onslaught-benjas180.turso.io",
    authToken:process.env.DB_TOKEN
})

await db.execute(`
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    date TEXT,
    time TEXT,
    content TEXT
)
`)

// Configurar cliente TCP para comunicarse con el servidor remoto
const serverAddress = '172.20.8.6';
const serverPort = 1234;
const nickName = 'Tesoreria(Prueba)';
const clientSocket = net.createConnection({ host: serverAddress, port: serverPort });

// Manejar eventos de conexión y desconexión del cliente TCP
clientSocket.on('connect', () => {
    console.log('Connected to remote server');
});

clientSocket.on('error', (error) => {
    console.error('Error connecting to remote server:', error);
});

clientSocket.on('close', () => {
    console.log('Disconnected from remote server');
});

function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}
function getCurrentDate(){
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Sumamos 1 porque los meses van de 0 a 11
    const year = now.getFullYear().toString();
    return `${day}/${month}/${year}`;

}

clientSocket.on('data', async (data) => {
    const mensaje = data.toString();
    const message = mensaje.replace(/[\u0000-\u001F\u007F-\u009F]$/, '')
    const parts = message.split('')
    const user = parts[1]
    const messageContent = parts.slice(2).join('')
    const messageType = parts[0]
    console.log(messageType)
    let result

    if (messageType === 'MSG'){
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (user,date,time,content) VALUES (:user,:date,:time,:messageContent)',
                args: {
                    user,
                    date: getCurrentDate(),
                    time:getCurrentTime(),
                    messageContent
                }
            })
        } catch(e){
            console.error(e)
            return
        }
        if (!mensaje.includes(nickName)) {
            io.emit('mensajeDesdeServidor', mensaje, result.lastInsertRowid.toString());
        }
    }
});

// Escuchar mensajes de los clientes y enviarlos al servidor remoto a través del cliente TCP
io.on('connection', async (socket) => {
    console.log('A user has connected!');

    socket.on('sendMessageToServer', (message) => {
        clientSocket.write(`MSG\x02${nickName}\x02${message}\x04`);
    });

    socket.on('disconnect', () => {
        console.log('A user has disconnected');
    });

    if (!socket.recovered) {
        try{
            const results = await db.execute({
                sql:'SELECT id,user,content FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
        })
        }catch (e){
            console.error(e)
        }
    }
});

app.use(logger('dev'));

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});
