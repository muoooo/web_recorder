const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the frontend HTML files from the current directory
app.use(express.static(__dirname));

// Keep track of active rooms in memory
// Structure: { "CODE1": { host: "socketId", users: ["socketId", "socketId2"] } }
const activeRooms = new Map();

// Helper to generate a random 5-character code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, I, 0, or 1 to avoid typos
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- HANDLE ROOM CREATION ---
    socket.on('create_room', () => {
        let roomCode = generateRoomCode();
        
        // Ensure code uniqueness
        while (activeRooms.has(roomCode)) {
            roomCode = generateRoomCode();
        }

        // Save room structure
        activeRooms.set(roomCode, {
            host: socket.id,
            users: [socket.id]
        });

        // Join the Socket.io room channel
        socket.join(roomCode);
        
        // Send code back to the creator
        socket.emit('room_created', roomCode);
        io.to(roomCode).emit('update_users', activeRooms.get(roomCode).users);
    });

    // --- HANDLE ROOM JOINING ---
    socket.on('join_room', (roomCode) => {
        const cleanCode = roomCode.toUpperCase().trim();

        if (activeRooms.has(cleanCode)) {
            const room = activeRooms.get(cleanCode);
            
            // Join the channel and update array
            room.users.push(socket.id);
            socket.join(cleanCode);

            // Inform client of success
            socket.emit('join_success', cleanCode);
            
            // Broadcast updated user list to everyone in the room
            io.to(cleanCode).emit('update_users', room.users);
        } else {
            socket.emit('join_error', 'Invalid code. Room not found.');
        }
    });

    // --- HANDLE DISCONNECT & CLEANUP ---
    socket.on('disconnect', () => {
        activeRooms.forEach((room, roomCode) => {
            if (room.users.includes(socket.id)) {
                // Remove user from room array
                room.users = room.users.filter(id => id !== socket.id);
                
                // Close room if host leaves or room becomes empty
                if (room.users.length === 0 || socket.id === room.host) {
                    activeRooms.delete(roomCode);
                    io.to(roomCode).emit('room_closed', 'The room was closed by the host.');
                } else {
                    // Just update user list for remaining players
                    io.to(roomCode).emit('update_users', room.users);
                }
            }
        });
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
