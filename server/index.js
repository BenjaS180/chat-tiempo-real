// Servidor Intermediario
import express from 'express';
import logger from 'morgan';
import { Server } from 'socket.io';
import { createServer } from 'http';
import net from 'net';
import dotenv from 'dotenv'
import { createClient } from '@libsql/client';
import jwt from 'jsonwebtoken';

dotenv.config()

process.env.TOKEN_SECRET;
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


app.use(express.urlencoded({ extended: true })); // Middleware para analizar cuerpos de solicitud codificados en url
app.use(express.json()); // Middleware para analizar cuerpos de solicitud JSON


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


});

app.use(logger('dev'));



app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/login.html');
});


function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}


app.get('/chat', authenticateToken, (req, res) => {
    // Si el middleware authenticateToken pasa (es decir, el usuario está autenticado),
    // enviar el archivo HTML de la página de chat.
    res.sendFile(process.cwd() + '/client/index.html');
});

// Manejar el acceso no autorizado a la ruta de chat
app.use('/chat', (req, res) => {
    // Si el usuario no está autenticado, enviar un mensaje de error o redirigir a otra página.
    res.status(403).send('Acceso no autorizado. Por favor, inicie sesión para acceder al chat.');
});

app.get('/admin', (req, res) => {
    res.sendFile(process.cwd() + '/client/admin.html');
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Username:', username);
    console.log('Password:', password);

    try {
        // Verificar las credenciales en la base de datos
        const result = await db.execute({
            sql: 'SELECT username, password FROM users WHERE username = ? AND password = ?',
            args: [username, password]
        });

        // Verificar si hay resultados en el resultado de la consulta
        if (result && result.rows && result.rows.length > 0) {
            // Credenciales válidas, redireccionar al usuario a la página de chat
            res.status(200).json({ message: 'Login successful' });
        } else {
            // No se encontraron resultados, credenciales inválidas
            res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

app.post('/verifyToken', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (token) {
        jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
            if (err) {
                console.error('Error verifying token:', err);
                res.sendStatus(403);
            } else {
                // Token válido
                res.sendStatus(200);
            }
        });
    } else {
        res.sendStatus(401); // No se proporcionó ningún token
    }
});

app.post('/createUser', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Crear la tabla de usuarios si no existe
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                password TEXT
            )
        `);

        // Insertar el nuevo usuario en la tabla de usuarios
        const result = await db.execute({
            sql: 'INSERT INTO users (username, password) VALUES (:username, :password)',
            args: {
                username,
                password
            }
        });

        res.redirect('/');

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).send('Internal Server Error');
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});

