const http = require('http');
const fs = require('fs');
const path = require('path');

// Path to the file where appointments will be stored.  The server
// persists each appointment as a JSON object in this file.
const bookingsFile = path.join(__dirname, 'bookings.json');

/**
 * Read all bookings from the JSON file.  If the file does not exist
 * or contains invalid JSON, an empty list is returned.
 *
 * @returns {Array<Object>} list of booking objects
 */
function readBookings() {
  try {
    const data = fs.readFileSync(bookingsFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // No file or invalid JSON means no bookings yet
    return [];
  }
}

/**
 * Save an array of bookings back to disk.  The JSON is formatted
 * with indentation for readability when the file is opened directly.
 *
 * @param {Array<Object>} bookings
 */
function saveBookings(bookings) {
  fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));
}

/**
 * Send a static file from the `draconsulta_site` directory.  If the
 * file does not exist, a 404 response is sent.  Content type is
 * determined based on file extension for common types.
 *
 * @param {string} filePath relative path to serve (e.g. 'index.html')
 * @param {http.ServerResponse} res
 */
function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Arquivo não encontrado');
      return;
    }
    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    let contentType;
    switch (ext) {
      case '.html':
        contentType = 'text/html';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.js':
        contentType = 'application/javascript';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.ico':
        contentType = 'image/x-icon';
        break;
      default:
        contentType = 'application/octet-stream';
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/**
 * Create the HTTP server.  It serves static files from the
 * `draconsulta_site` directory and exposes a simple JSON API for
 * listing and storing appointments.  All JSON API endpoints begin
 * with `/api/`.
 */
const server = http.createServer((req, res) => {
  const { method, url } = req;
  // Handle API endpoints
  if (url === '/api/book' && method === 'POST') {
    // Collect the request body
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Protect against excessively large payloads
      if (body.length > 1e6) {
        req.connection.destroy();
      }
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        // Append a timestamp identifier to the booking
        const bookings = readBookings();
        data.id = Date.now();
        data.timestamp = new Date().toISOString();
        bookings.push(data);
        saveBookings(bookings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: data.id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dados inválidos' }));
      }
    });
    return;
  }
  if (url === '/api/bookings' && method === 'GET') {
    const bookings = readBookings();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(bookings));
    return;
  }
  // Delete a booking by ID via GET or POST
  if (url.startsWith('/api/delete')) {
    // Extract ID either from query string (e.g., /api/delete?id=123) or from POST body
    const parsedUrl = new URL(url, `http://${req.headers.host}`);
    const idParam = parsedUrl.searchParams.get('id');
    const sendResponse = () => {
      if (!idParam) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ID não especificado' }));
        return;
      }
      const id = Number(idParam);
      let bookings = readBookings();
      const originalLength = bookings.length;
      bookings = bookings.filter(b => b.id !== id);
      if (bookings.length === originalLength) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Registro não encontrado' }));
        return;
      }
      saveBookings(bookings);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    };
    if (method === 'POST') {
      // For POST, gather body to override query param if provided
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data && data.id) parsedUrl.searchParams.set('id', data.id);
        } catch (_) {
          // ignore invalid JSON and rely on query param
        }
        sendResponse();
      });
    } else {
      sendResponse();
    }
    return;
  }
  // Default: serve static files
  let filePath = '.' + url;
  if (filePath === './' || filePath === './index') {
    filePath = './index.html';
  }
  // Sanitize to prevent directory traversal
  const resolvedPath = path.join(__dirname, filePath);
  // If the path is outside the site directory, deny access
  if (!resolvedPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Acesso negado');
    return;
  }
  serveStatic(resolvedPath, res);
});

// Start the server on port 3000.  When running inside the container,
// use port 3000 so it does not conflict with other services.  The
// console output provides a URL for manual testing.
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});

});
