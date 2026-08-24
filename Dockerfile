FROM python:3.11-slim

# Install system dependencies (Terraform CLI included)
RUN apt-get update && apt-get install -y \
    curl unzip git wget gnupg \
    && curl -fsSL https://releases.hashicorp.com/terraform/1.8.5/terraform_1.8.5_linux_amd64.zip -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Backend package only — avoids repo-root main.py colliding with uvicorn main:app
COPY backend/ /app/

ENV PYTHONPATH="/app"
ENV PORT=8050
EXPOSE 8050

# Render injects PORT; health check hits /health
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8050}"]
