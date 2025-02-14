# SDT

A simple application that sends messages to users at 9 AM in their local time.

### Overview

- The app always runs in **UTC** (`TZ=UTC`).
- A **daily cron job** at **00:00 UTC** finds users with birthdays that day and schedules their messages for **9 AM in their local time**.
- An **hourly cron job** checks for messages that need to be sent and attempts to deliver them.
- The system has **retry and timeout handling** for sending messages to the external API.
- If a message **fails to send** after multiple retries, it will be **retried in the next hour**.
- A **`message_templates` table** allows new message types to be added easily. Each new message type requires a corresponding cron job to schedule it.

### How to Run

```sh
cp .env.example .env
npm install
npm run dev
# or
npm run build
npm run start
```

#### Test

```sh
npm run test
# or
npm run test:coverage && open coverage/index.html
```

Access the API at http://localhost:3000.

### Endpoints

There is an [`openapi.yml`](/openapi.yml) file and a [`.bruno`](/.bruno) folder (for use with [Bruno](https://www.usebruno.com/)) to view a list of all endpoints.

- `POST /user`

  ```json
  {
    "email": "john@mail.com",
    "firstName": "John",
    "lastName": "Doe",
    "birthDate": "2025-01-01", // YYYY-MM-DD
    "location": "Asia/Jakarta" // IANA Time Zone
  }
  ```

- `PUT /user/:id`

  ```json
  {
    "email": "john@mail.com",
    "firstName": "John",
    "lastName": "Doe",
    "birthDate": "2025-01-01", // YYYY-MM-DD
    "location": "Asia/Jakarta" // IANA Time Zone
  }
  ```

- `DELETE /user/:id`
