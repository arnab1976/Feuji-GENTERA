FROM python:3.11-slim

# Use when Render Root Directory = backend
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ca-certificates \
    && curl -fsSL https://releases.hashicorp.com/terraform/1.8.5/terraform_1.8.5_linux_amd64.zip -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/

RUN chmod +x /app/start.sh \
    && python -c "import main; print('bake-ok', main.app.title)"

ENV PYTHONPATH="/app"
ENV PYTHONUNBUFFERED=1
ENV PORT=8050
EXPOSE 8050

CMD ["sh", "/app/start.sh"]
