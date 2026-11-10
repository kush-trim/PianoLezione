import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { computeAllegati } from "../plan-utils";
import { computeSchedule, fromMin, planIntervals } from "../schedule";
import type { PlanDTO } from "../types";

// Layout ricalcato sul modello "Alcuni aspetti del piano lezione": A4 orizzontale,
// tabella a 5 colonne con le stesse proporzioni dell'originale.
const COLS = ["9.1%", "19.8%", "36.9%", "19.8%", "14.4%"] as const;
const BORDER = 0.75;

// La sillabazione predefinita è quella inglese ("PAG-INA"): meglio non spezzare le parole.
Font.registerHyphenationCallback((word) => [word]);

const FOOTNOTE =
  "______________________________\n¹ Descrivere i comportamenti e i prodotti attesi dagli allievi che mostrano lo sviluppo delle competenze (sia disciplinari che trasversali) in gioco.";

const s = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 48,
    paddingHorizontal: 22,
    fontFamily: "Helvetica",
    fontSize: 8.5,
    lineHeight: 1.3,
    color: "#000",
  },
  brand: { position: "absolute", top: 22, right: 22, fontFamily: "Helvetica-Bold", fontSize: 13 },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    textAlign: "center",
    marginTop: 26,
    marginBottom: 26,
  },
  section: { marginBottom: 16 },
  heading: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  table: { marginBottom: 18, paddingTop: BORDER },
  // Ogni riga ha il proprio bordo completo (sovrapposto a quello della riga sopra),
  // così la tabella resta chiusa anche quando continua sulla pagina successiva.
  row: { flexDirection: "row", borderWidth: BORDER, borderColor: "#000", marginTop: -BORDER },
  cell: {
    borderLeftWidth: BORDER,
    borderColor: "#000",
    marginLeft: -BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8,
    justifyContent: "center",
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, justifyContent: "flex-start", paddingVertical: 3 },
  time: { marginTop: 1 },
  footnote: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 14,
    fontSize: 7,
  },
});

function Section({ title, text, hint }: { title: string; text: string; hint?: string }) {
  return (
    <View style={s.section}>
      {/* Il titolo resta attaccato alla prima riga del testo. */}
      <Text style={s.heading} minPresenceAhead={24}>
        {title}
      </Text>
      <Text>{text.trim() || hint || " "}</Text>
    </View>
  );
}

function PianoLezionePdf({ plan }: { plan: PlanDTO }) {
  const schedule = computeSchedule(
    planIntervals(plan),
    plan.phases.map((p) => p.durationMin),
  );
  const allegati = plan.allegatiAuto ? computeAllegati(plan.phases) : plan.allegati;
  const title = plan.title.trim()
    ? `Alcuni aspetti del piano lezione (${plan.title.trim()})`
    : "Alcuni aspetti del piano lezione";

  return (
    <Document title={title} language="it">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.brand}>SUPSI</Text>
        {/* Nota a piè di pagina, `fixed`: ripetuta in fondo a ogni pagina. Non posizionarla con `top` fuori
            dall'area utile: l'impaginatore di react-pdf entra in un ciclo infinito. */}
        <Text fixed style={s.footnote}>
          {FOOTNOTE}
        </Text>
        <Text style={s.title}>{title}</Text>

        <Section title="Prerequisiti degli allievi" text={plan.prerequisiti} />
        <Section title="Obiettivo d’insegnamento" text={plan.obiettivoInsegnamento} hint="- Il docente" />
        <Section
          title="Traguardo di apprendimento specifico al quale principalmente si riferisce la lezione"
          text={plan.traguardo}
        />
        <Section
          title="Obiettivo d’apprendimento (disciplinare / trasversale)"
          text={plan.obiettivoApprendimento}
          hint="- L’allievo"
        />

        <Text style={[s.heading, { marginBottom: 6 }]} minPresenceAhead={60}>
          Articolazione operativa
        </Text>
        <View style={s.table}>
          <View style={s.row} wrap={false}>
            {["Tempi e fasi", "Obiettivi specifici d’apprendimento", "Descrizione", "Prodotto atteso¹", "Materiale"].map(
              (h, i) => (
                <View key={h} style={[s.cell, s.th, { width: COLS[i] }]}>
                  <Text>{h}</Text>
                </View>
              ),
            )}
          </View>
          {plan.phases.map((ph, i) => {
            const t = schedule.phases[i];
            return (
              <View key={ph.id} style={s.row} wrap={false}>
                <View style={[s.cell, { width: COLS[0] }]}>
                  <Text>{ph.name}</Text>
                  {ph.modality.trim() ? <Text>({ph.modality.trim()})</Text> : null}
                  <Text style={s.time}>
                    {ph.durationMin}’
                    {schedule.hasClock ? `\n${fromMin(t.start)}–${fromMin(t.end)}` : ""}
                  </Text>
                </View>
                <View style={[s.cell, { width: COLS[1] }]}>
                  <Text>{ph.obiettiviSpecifici}</Text>
                </View>
                <View style={[s.cell, { width: COLS[2] }]}>
                  <Text>{ph.descrizione}</Text>
                </View>
                <View style={[s.cell, { width: COLS[3] }]}>
                  <Text>{ph.prodottoAtteso}</Text>
                </View>
                <View style={[s.cell, { width: COLS[4] }]}>
                  <Text>{ph.materiale}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Section
          title="Verifica dell’obiettivo (quali azioni dell’allievo mi permettono di capire se l’obiettivo di apprendimento è stato raggiunto?)"
          text={plan.verifica}
          hint="L’allievo"
        />
        <Section title="Ev. Allegati" text={allegati} />
        {plan.sezioniExtra
          .filter((x) => x.titolo.trim() || x.testo.trim())
          .map((x) => (
            <Section key={x.id} title={x.titolo} text={x.testo} />
          ))}

      </Page>
    </Document>
  );
}

export function renderPlanPdf(plan: PlanDTO): Promise<Buffer> {
  return renderToBuffer(<PianoLezionePdf plan={plan} />);
}
