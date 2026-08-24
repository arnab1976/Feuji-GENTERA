FROM python:3.11-slim

# Install system dependencies (Terraform CLI included)
RUN apt-get update && apt-get install -y \
    curl unzip git wget gnupg \
    && curl -fsSL https://releases.hashicorp.com/terraform/1.8.5/terraform_1.8.5_linux_amd64.zip -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . /app/

ENV PYTHONPATH="/app:/app/backend"
ENV PORT=8050

RUN if [ -f "/app/requirements.txt" ]; then pip install --no-cache-dir -r /app/requirements.txt; \
    elif [ -f "/app/backend/requirements.txt" ]; then pip install --no-cache-dir -r /app/backend/requirements.txt; fi

RUN if [ -d "/app/backend" ] && [ -f "/app/backend/main.py" ]; then cp -rn /app/backend/* /app/; fi

EXPOSE 8050

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8050}"]
