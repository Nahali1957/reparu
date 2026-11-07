FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /sim
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 1000 sim
COPY sim.py .
USER sim
CMD ["python", "sim.py"]
