# HelpDesk REST API

A secure REST API for managing IT help desk support tickets. This project includes user authentication, role-based access control, ticket management, filtering, and audit logging.

## Features

- User registration and login
- Password hashing with bcrypt
- JWT authentication
- Role-based access control
- Admin and technician roles
- Create, read, update, and delete tickets
- Technicians can only view and update assigned tickets
- Admins can manage all tickets
- Filter tickets by status, priority, category, and assigned technician
- Audit logging for ticket actions and unauthorized update attempts
- SQLite database with Prisma ORM

## Tech Stack

- Node.js
- Express.js
- Prisma ORM
- SQLite
- bcryptjs
- JSON Web Tokens
- Thunder Client for API testing

## API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Login and receive JWT token |
| GET | `/auth/me` | Get current logged-in user |

### Tickets

| Method | Endpoint | Description |
|---|---|---|
| GET | `/tickets` | Get tickets based on user role |
| GET | `/tickets/:id` | Get one ticket |
| POST | `/tickets` | Create a ticket |
| PUT | `/tickets/:id` | Update a ticket |
| DELETE | `/tickets/:id` | Delete a ticket, admin only |

### Audit Logs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/audit-logs` | View audit logs, admin only |

## Example Ticket JSON

```json
{
  "title": "VPN Access Issue",
  "description": "Remote employee cannot connect to the company VPN",
  "priority": "High",
  "category": "Network",
  "requester": "Sarah Johnson",
  "assignedTo": "tech@example.com"
}