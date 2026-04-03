const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<h1>CashClaw is Running! 🚀</h1>');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CashClaw running on port ${PORT}`);
});