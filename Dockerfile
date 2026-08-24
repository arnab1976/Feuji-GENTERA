FROM python:3.11-slim

# Feuji GENTERA — Render backend image (repo-root context)
# Render settings that MUST match:
#   Dockerfile Path : ./Dockerfile
#   Docker Context  : .
#   Clear any custom "Docker Command" / Start Command override
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ca-certificates \
    && curl -fsSL https://releases.hashicorp.com/terraform/1.8.5/terraform_1.8.5_linux_amd64.zip -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Only backend sources — never copy repo-root main.py into the image
COPY backend/ /app/

RUN chmod +x /app/start.sh \
    && test -f /app/main.py \
    && test -f /app/app/config.py \
    && python -c "import main; print('bake-ok', main.app.title)"

ENV PYTHONPATH="/app"
ENV PYTHONUNBUFFERED=1
ENV PORT=8050
EXPOSE 8050

# Do not override this on Render — it respects $PORT automatically
CMD ["sh", "/app/start.sh"]
