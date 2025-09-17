# Use Node.js 20 (Alpine) as the base image
FROM node:23-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your application source code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]