// Servidor Intermediario
import express from 'express';
import logger from 'morgan';
import { Server } from 'socket.io';
import { createServer } from 'http';
import net from 'net';

const port = process.env.PORT ?? 8000;

const app = express();
const server = createServer(app);
const io = new Server(server,{
    connectionStateRecovery
});

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


clientSocket.on('data', (data) => {
    const mensaje = data.toString();
    if (!mensaje.includes(nickName)) {
        io.emit('mensajeDesdeServidor', mensaje);
    }
});

// Escuchar mensajes de los clientes y enviarlos al servidor remoto a través del cliente TCP
io.on('connection', (socket) => {
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
    res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, '172.20.10.4', () => {
    console.log(`Server running on http://172.20.10.4:${port}`);
});
