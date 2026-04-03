module.exports = (req, res) => {
  res.status(200).json({
    status: 'running',
    message: 'CashClaw is Running! 🚀',
    version: '1.0.0'
  });
};