#!/bin/bash

# Solana Bot - PostgreSQL Setup Script
# Usage: ./setup_postgres.sh

DB_NAME="solana_bot"
DB_USER="postgres"
SCHEMA_FILE="rust-engine/schema.sql"

echo "----------------------------------------"
echo "Initializing PostgreSQL Setup for Solana Bot"
echo "----------------------------------------"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql command not found."
    echo "Please install PostgreSQL 18 (or compatible version)."
    exit 1
fi

echo "✅ PostgreSQL client found."

# Create Database if it doesn't exist
if psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "ℹ️  Database '$DB_NAME' already exists."
else
    echo "🔄 Creating database '$DB_NAME'..."
    createdb -U $DB_USER $DB_NAME
    if [ $? -eq 0 ]; then
        echo "✅ Database created successfully."
    else
        echo "❌ Failed to create database. Check permissions."
        exit 1
    fi
fi

# Apply Schema
echo "🔄 Applying schema from $SCHEMA_FILE..."
if [ -f "$SCHEMA_FILE" ]; then
    psql -U $DB_USER -d $DB_NAME -f $SCHEMA_FILE
    if [ $? -eq 0 ]; then
        echo "✅ Schema applied successfully!"
        echo "   - Created tables: users, wallets"
        echo "----------------------------------------"
        echo "Setup Complete. ready to run bots."
    else
        echo "❌ Failed to apply schema."
        exit 1
    fi
else
    echo "❌ Schema file not found at $SCHEMA_FILE"
    exit 1
fi
