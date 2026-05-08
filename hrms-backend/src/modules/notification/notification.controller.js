const prisma = require('../../config/database');

async function getMyNotifications(req, res) {
  try {
    // Standardize getting the user ID from the token
    const userId = req.user.id || req.user.EmployeeID || req.user.employeeId;
    
    const notifications = await prisma.notification.findMany({
      where: { RecipientID: userId },
      orderBy: { CreatedAt: 'desc' },
      take: 20 
    });

    // We send back the exact structure Header.js expects: { notifications: [] }
    return res.status(200).json({
      success: true,
      notifications: notifications 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
}

async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id || req.user.EmployeeID || req.user.employeeId;
    
    await prisma.notification.updateMany({
      where: { RecipientID: userId, IsRead: false },
      data: { IsRead: true }
    });

    return res.status(200).json({ 
      success: true, 
      message: 'All marked as read' 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
}

module.exports = { getMyNotifications, markAllAsRead };