const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();

app.use(cors());
app.use(express.json());
const prisma = new PrismaClient();
const PORT = 3000;
const JWT_SECRET = "helpdesk_secret_key";

// Home route
app.get("/", (req, res) => {
  res.json({ message: "HelpDesk REST API is running" });
});

//Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Access token required"
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        message: "Invalid or expired token"
      });
    }

    req.user = user;
    next();
  });
}

// Admin authorization middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required"
    });
  }

  next();
}

// Function to create an audit log entry
async function createAuditLog({ action, user, ticketId, details }) {
  await prisma.auditLog.create({
    data: {
      action,
      userId: user?.userId || null,
      userEmail: user?.email || null,
      role: user?.role || null,
      ticketId: ticketId || null,
      details: details || null
    }
  });
}

// Register route
app.post("/auth/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Name, email, and password are required"
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    return res.status(400).json({
      message: "User with this email already exists"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || "technician"
    }
  });

  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role
  });
});

// Login route
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required"
    });
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    return res.status(401).json({
      message: "Invalid email or password"
    });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({
      message: "Invalid email or password"
    });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    message: "Login successful",
    token
  });
});

// Get audit logs (admin only)
app.get("/audit-logs", authenticateToken, requireAdmin, async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });

  res.json(logs);
});

// Get current user info
app.get("/auth/me", authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true
    }
  });

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  res.json(user);
});

// GET all tickets
app.get("/tickets", authenticateToken, async (req, res) => {
  const { status, priority, category, assignedTo } = req.query;

  const where = {
    status: status || undefined,
    priority: priority || undefined,
    category: category || undefined,
    assignedTo: assignedTo || undefined
  };

  if (req.user.role !== "admin") {
    where.assignedTo = req.user.email;
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: {
      createdAt: "desc"
    }
  });

  res.json(tickets);
});

// GET one ticket
app.get("/tickets/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id);

  const ticket = await prisma.ticket.findUnique({
    where: { id }
  });

  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  res.json(ticket);
});

// POST create ticket
app.post("/tickets", authenticateToken, async (req, res) => {
  const { title, description, priority, category, requester, assignedTo } = req.body;

  if (!title || !description || !priority || !category || !requester) {
    return res.status(400).json({
      message: "Title, description, priority, category, and requester are required"
    });
  }

  const allowedPriorities = ["Low", "Medium", "High"];

  if (!allowedPriorities.includes(priority)) {
    return res.status(400).json({
      message: "Priority must be Low, Medium, or High"
    });
  }

  const newTicket = await prisma.ticket.create({
    data: {
      title,
      description,
      priority,
      category,
      requester,
      assignedTo
    }
  });

await createAuditLog({
  action: "TICKET_CREATED",
  user: req.user,
  ticketId: newTicket.id,
  details: `Ticket created with priority ${newTicket.priority} and category ${newTicket.category}`
});

  res.status(201).json(newTicket);
});

// PUT update ticket
app.put("/tickets/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id);

  const existingTicket = await prisma.ticket.findUnique({
    where: { id }
  });

  if (!existingTicket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  const userEmail = req.user.email;
  const userRole = req.user.role;

  if (userRole !== "admin" && existingTicket.assignedTo !== userEmail) {
  await createAuditLog({
    action: "UNAUTHORIZED_UPDATE_ATTEMPT",
    user: req.user,
    ticketId: existingTicket.id,
    details: "User attempted to update a ticket not assigned to them"
  });

  return res.status(403).json({
    message: "You can only update tickets assigned to you"
  });
}

  const allowedPriorities = ["Low", "Medium", "High"];
  const allowedStatuses = ["Open", "In Progress", "Resolved", "Closed"];

  if (req.body.priority && !allowedPriorities.includes(req.body.priority)) {
    return res.status(400).json({
      message: "Priority must be Low, Medium, or High"
    });
  }

  if (req.body.status && !allowedStatuses.includes(req.body.status)) {
    return res.status(400).json({
      message: "Status must be Open, In Progress, Resolved, or Closed"
    });
  }

  const updatedTicket = await prisma.ticket.update({
    where: { id },
    data: {
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority,
      status: req.body.status,
      category: req.body.category,
      requester: req.body.requester,
      assignedTo: req.body.assignedTo
    }
  });

await createAuditLog({
  action: "TICKET_UPDATED",
  user: req.user,
  ticketId: updatedTicket.id,
  details: `Ticket updated. Status: ${updatedTicket.status}, Priority: ${updatedTicket.priority}`
});

  res.json(updatedTicket);
});

// DELETE ticket
app.delete("/tickets/:id", authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const existingTicket = await prisma.ticket.findUnique({
    where: { id }
  });

  if (!existingTicket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  await prisma.ticket.delete({
    where: { id }
  });

await createAuditLog({
  action: "TICKET_DELETED",
  user: req.user,
  ticketId: id,
  details: "Ticket deleted"
});

  res.json({ message: "Ticket deleted" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});