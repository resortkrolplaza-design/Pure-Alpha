# Roadmap: 1000h Audio Processing & Voice Model Fine-tuning

**Data utworzenia:** 2026-01-11
**Status:** ZAPLANOWANE
**Priorytet:** P1

---

## 📊 Kontekst

Użytkownik posiada ~1000 godzin nagrań rozmów z działu rezerwacji i recepcji hotelowej. Te nagrania stanowią ogromną wartość dla:
- Automatycznej ekstrakcji FAQ
- Treningu modelu rozpoznawania mowy (ASR)
- Klasyfikacji intencji
- Analizy sentymentu
- Budowy kompletnej bazy wiedzy hotelowej

---

## ✅ Co już istnieje (GOTOWE)

| Komponent | Status | Plik | Opis |
|-----------|--------|------|------|
| Deepgram transcription | ✅ DONE | `lib/callcenter/deepgram-service.ts` | Batch transcription z nova-2 |
| FAQ extraction | ✅ DONE | `lib/callcenter/faq-auto-population.ts` | Claude-based extraction |
| Intent detection | ✅ DONE | `lib/callcenter/knowledge-service.ts` | 10+ hotel intents |
| Sentiment analysis | ✅ DONE | `lib/callcenter/analysis.ts` | -1 to +1 scale |
| Embeddings (pgvector) | ✅ DONE | `lib/callcenter/embeddings.ts` | Semantic search |
| Training Lab UI | ✅ DONE | `components/callcenter/TrainingLabPanel.tsx` | Unified interface |

---

## 🚀 Pipeline do zbudowania

### Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                    1000h AUDIO PROCESSING PIPELINE               │
└─────────────────────────────────────────────────────────────────┘

    1000h Audio Files (.wav/.mp3)
              │
              ▼
    ┌─────────────────────┐
    │  BULK UPLOAD TO S3  │  ← lib/callcenter/bulk-upload.ts
    │  - Chunking         │
    │  - Deduplication    │
    │  - Metadata extract │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │   QUEUE SYSTEM      │  ← Redis/SQS/BullMQ
    │   - Job scheduling  │
    │   - Priority queues │
    │   - Retry logic     │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  PARALLEL WORKERS   │  ← lib/callcenter/bulk-processing.ts
    │  - 10-50 concurrent │
    │  - Rate limiting    │
    │  - Progress tracking│
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  TRANSCRIPTION      │  ← Deepgram API (existing)
    │  - nova-2 model     │
    │  - Speaker diarize  │
    │  - Polish optimized │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  POST-PROCESSING    │
    │  - FAQ Extraction   │  ← faq-auto-population.ts
    │  - Intent Labeling  │  ← knowledge-service.ts
    │  - Sentiment Score  │  ← analysis.ts
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  TRAINING DATASET   │  ← lib/callcenter/whisper-training.ts
    │  - audio + transcript│
    │  - intent labels    │
    │  - sentiment labels │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  MODEL FINE-TUNING  │  ← Whisper / Custom ASR
    │  - Polish hotel vocab│
    │  - Intent classifier │
    │  - Sentiment model   │
    └─────────────────────┘
```

---

## 🎯 Punkt C: Fine-tuning własnego modelu głosowego

### Opcja 1: Whisper Fine-tuning (REKOMENDOWANA)

**Charakterystyka:**
- Koszt: ~$500-2000 (GPU rental)
- Czas: 1-2 tygodnie
- Kontrola: 100% (self-hosted)
- GDPR: ✅ Dane zostają lokalnie

**Proces:**
1. Transkrypcja 1000h przez Deepgram (istniejący pipeline)
2. Tworzenie datasetu: `audio_chunk.wav` → `transcript.txt`
3. Fine-tune Whisper large-v3 na polskim hotelowym słownictwie
4. Deploy na GPU (RunPod/Lambda Labs/własne)

**Słownictwo do nauki:**
- Terminy hotelowe: "check-in", "check-out", "rezerwacja", "anulacja"
- Numery pokoi: "pokój 101", "apartament 5"
- Nazwy hoteli sieci
- Daty i godziny w polskim formacie
- Imiona i nazwiska gości

**Implementacja:**
```typescript
// lib/callcenter/whisper-training.ts
interface TrainingDataset {
  audioPath: string;      // S3 path to audio chunk
  transcript: string;     // Verified transcript
  duration: number;       // Seconds
  language: "pl" | "en";
  speaker: "customer" | "agent";
  hotelId: string;
}

// Export format for Whisper fine-tuning
interface WhisperTrainingFormat {
  audio: string;          // Base64 or path
  text: string;           // Ground truth transcript
  language: string;
}
```

### Opcja 2: Deepgram Custom Training (Enterprise)

**Charakterystyka:**
- Koszt: $5,000-50,000+
- Czas: 4-6 tygodni
- Kontrola: Ograniczona (ich infrastruktura)
- GDPR: ⚠️ Dane opuszczają premises

**Kiedy wybrać:**
- Duży budżet
- Brak własnej infrastruktury ML
- Potrzeba enterprise support

### Opcja 3: Azure Speech Custom Neural Voice

**Charakterystyka:**
- Koszt: $0.10/1000 znaków + training fee
- Czas: 2-4 tygodnie
- Kontrola: Microsoft Cloud
- GDPR: ✅ Azure EU regions

**Kiedy wybrać:**
- Już używasz Azure
- Potrzebujesz custom TTS (głos bota)
- Compliance requirements

### Opcja 4: Hybrid Approach (Najlepsza jakość)

```
STT: Whisper Fine-tuned (rozpoznawanie mowy)
     ↓
NLU: Claude/GPT (zrozumienie intencji)
     ↓
TTS: ElevenLabs Voice Clone (synteza mowy)
```

---

## 📁 Pliki do stworzenia

### Backend

| Plik | Opis | Priorytet |
|------|------|-----------|
| `lib/callcenter/bulk-upload.ts` | Upload i chunking 1000h | P1 |
| `lib/callcenter/bulk-processing.ts` | Kolejkowanie i przetwarzanie | P1 |
| `lib/callcenter/whisper-training.ts` | Przygotowanie datasetu | P2 |
| `lib/callcenter/intent-trainer.ts` | Trening klasyfikatora intencji | P2 |
| `lib/callcenter/audio-quality.ts` | Walidacja jakości audio | P3 |

### API Routes

| Route | Opis | Priorytet |
|-------|------|-----------|
| `app/api/callcenter/bulk/upload/route.ts` | Bulk upload endpoint | P1 |
| `app/api/callcenter/bulk/status/route.ts` | Progress monitoring | P1 |
| `app/api/callcenter/bulk/process/route.ts` | Start processing job | P1 |
| `app/api/callcenter/training/export/route.ts` | Export training dataset | P2 |

### UI Components

| Komponent | Opis | Priorytet |
|-----------|------|-----------|
| Training Lab → Bulk Processing tab | Upload & monitoring UI | P1 |
| Training Lab → Model Training tab | Fine-tuning progress | P2 |
| Training Lab → Dataset Explorer | Browse training data | P3 |

---

## 📈 Szacowane rezultaty

### Po przetworzeniu 1000h:

| Metryka | Szacowana wartość |
|---------|-------------------|
| Unikalne FAQ | 5,000 - 15,000 |
| Warianty pytań | 50,000+ |
| Intent samples | 100,000+ |
| Sentiment samples | 100,000+ |
| Custom vocab terms | 500-1,000 |

### Po fine-tuningu Whisper:

| Metryka | Przed | Po |
|---------|-------|-----|
| WER (Word Error Rate) | 8-12% | 3-5% |
| Hotelowe terminy | 70% | 95%+ |
| Numery pokoi | 60% | 98%+ |
| Nazwy własne | 50% | 85%+ |

---

## ⏱️ Timeline (bez dat, tylko sekwencja)

### Faza 1: Bulk Processing Pipeline
- [ ] Implementacja bulk upload
- [ ] Queue system setup
- [ ] Parallel workers
- [ ] Progress monitoring UI

### Faza 2: Dataset Preparation
- [ ] Transkrypcja wszystkich 1000h
- [ ] FAQ extraction at scale
- [ ] Intent labeling
- [ ] Quality validation

### Faza 3: Model Fine-tuning
- [ ] Whisper dataset export
- [ ] GPU infrastructure setup
- [ ] Fine-tuning process
- [ ] Evaluation & testing

### Faza 4: Deployment
- [ ] Model deployment (inference)
- [ ] Integration with existing pipeline
- [ ] A/B testing vs Deepgram
- [ ] Production rollout

---

## 🔗 Powiązane dokumenty

- [Call Routing System Plan](./plan-call-routing-system.md)
- [Training Lab Implementation](../components/callcenter/TrainingLabPanel.tsx)
- [Embeddings Service](../lib/callcenter/embeddings.ts)

---

## 📝 Notatki

**Format nagrań:** TBD (do potwierdzenia z użytkownikiem)
- Ścieżka do plików
- Format (.wav, .mp3, .ogg)
- Czy już w S3?
- Metadata (data, hotel, agent)

**Następne kroki:**
1. ✅ Roadmapa zapisana
2. → Powrót do Call Routing System (przekierowanie do bota)
3. Później: implementacja bulk processing pipeline
