'use strict';
/* Rutina precargada (estado inicial). Pesos siempre en kg internamente. */
const DEFAULT_REST = 100; // 1:40

function ex(id, group, name, grip, sets, repsTarget, type, url){
  return { id, group, name, grip, sets, repsTarget, type, restSec: DEFAULT_REST, url };
}

const DEFAULT_ROUTINE = {
  version: 1,
  days: [
    {
      id: 'd1',
      name: 'Día 1 - Pecho y Bíceps',
      exercises: [
        ex('d1e1', 'Pecho', 'Press plano (barra o mancuernas)', 'Prono, ancho apenas mayor a hombros', 4, '6-10', 'reps', 'https://musclewiki.com/exercise/barbell-bench-press'),
        ex('d1e2', 'Pecho', 'Press inclinado con mancuernas', 'Prono o semi-neutro (45°), ancho de hombros', 3, '8-12', 'reps', 'https://musclewiki.com/exercise/dumbbell-incline-bench-press'),
        ex('d1e3', 'Pecho', 'Press declinado', 'Prono, ancho apenas mayor a hombros', 3, '8-12', 'reps', 'https://www.fitnessai.com/exercise/decline-dumbbell-bench-press'),
        ex('d1e4', 'Pecho', 'Aperturas en polea o pec deck', 'Neutro, codo semi-flexionado fijo', 3, '10-15', 'reps', 'https://musclewiki.com/exercise/cable-pec-fly'),
        ex('d1e5', 'Bíceps', 'Curl con barra (recta o Z)', 'Supino, ancho de hombros', 4, '8-10', 'reps', 'https://musclewiki.com/exercise/barbell-curl'),
        ex('d1e6', 'Bíceps', 'Curl inclinado con mancuernas', 'Supino, brazos colgando verticales', 3, '10-12', 'reps', 'https://musclewiki.com/exercise/dumbbell-incline-curl'),
        ex('d1e7', 'Bíceps', 'Curl martillo', 'Neutro (palmas enfrentadas)', 3, '10-15', 'reps', 'https://musclewiki.com/exercise/dumbbell-hammer-curl'),
        ex('d1e8', 'Abdominales', 'Crunch en polea con peso', 'Soga a los costados de la cabeza', 3, '10-15', 'reps', 'https://musclewiki.com/exercise/cable-standing-crunch'),
        ex('d1e9', 'Opcional', 'Fondos negativos o con banda (práctica)', 'Neutro en paralelas, torso inclinado adelante', 2, '3-5', 'reps', 'https://musclewiki.com/exercise/plate-weighted-dip')
      ],
      stretches: [
        { name: 'Pecho en marco de puerta — 30 seg/lado', url: 'https://www.acefitness.org/resources/everyone/blog/5657/5-chest-stretch-variations/' },
        { name: 'Apertura acostado en banco — 30-45 seg', url: 'https://www.setforset.com/blogs/news/chest-stretches' },
        { name: 'Bíceps en pared — 30 seg/lado', url: 'https://www.hingehealth.com/resources/articles/bicep-stretch/' },
        { name: 'Hombro anterior con manos atrás — 30 seg', url: 'https://greatist.com/fitness/bicep-stretch' }
      ]
    },
    {
      id: 'd2',
      name: 'Día 2 - Piernas y Hombros',
      exercises: [
        ex('d2e1', 'Piernas', 'Sentadilla con barra (o prensa)', 'Barra: prono, apenas más ancho que hombros', 4, '6-10', 'reps', 'https://musclewiki.com/exercise/barbell-squat'),
        ex('d2e2', 'Piernas', 'Pull-through en polea', 'Soga entre las piernas, palmas enfrentadas', 3, '12-15', 'reps', 'https://weighttraining.guide/exercises/cable-pull-through/'),
        ex('d2e3', 'Piernas', 'Estocadas o curl femoral (alternar)', 'Mancuernas neutras / tobillos bajo el rodillo', 3, '10-12', 'reps', 'https://musclewiki.com/exercise/dumbbell-forward-lunge'),
        ex('d2e4', 'Piernas', 'Gemelos de pie', 'Apoyo en metatarsos, talón libre', 3, '12-20', 'reps', 'https://musclewiki.com/exercise/machine-standing-calf-raises'),
        ex('d2e5', 'Hombros', 'Press militar (barra o mancuernas)', 'Prono, apenas más ancho que hombros', 4, '6-10', 'reps', 'https://musclewiki.com/articles/mastering-the-barbell-overhead-press'),
        ex('d2e6', 'Hombros', 'Elevaciones laterales', 'Neutro, codo semi-flexionado', 3, '12-20', 'reps', 'https://musclewiki.com/exercise/dumbbell-lateral-raise'),
        ex('d2e7', 'Hombros', 'Face pulls o pájaros', 'Soga: prono, pulgares hacia atrás', 3, '12-15', 'reps', 'https://musclewiki.com/exercise/machine-face-pulls'),
        ex('d2e8', 'Abdominales', 'Elevación de piernas/rodillas colgado', 'Prono en barra, ancho de hombros', 3, '10-15', 'reps', 'https://musclewiki.com/exercise/hanging-knee-raises')
      ],
      stretches: [
        { name: 'Cuádriceps de pie — 30 seg/lado', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848' },
        { name: 'Femorales sentado — 30 seg/lado', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848' },
        { name: 'Gemelos en escalón — 30 seg/lado', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848' },
        { name: 'Hombro cruzado — 30 seg/lado', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848' },
        { name: 'Glúteos figura 4 — 30 seg/lado', url: 'https://www.hingehealth.com/resources/articles/figure-four/' }
      ]
    },
    {
      id: 'd3',
      name: 'Día 3 - Espalda y Tríceps',
      exercises: [
        ex('d3e1', 'Espalda', 'Dominadas o jalón al pecho', 'Prono, apenas más ancho que hombros', 4, '6-10', 'reps', 'https://musclewiki.com/exercise/weighted-pull-ups'),
        ex('d3e2', 'Espalda', 'Remo con barra o en máquina', 'Prono, ancho de hombros', 4, '8-10', 'reps', 'https://musclewiki.com/exercise/barbell-bent-over-row'),
        ex('d3e3', 'Espalda', 'Remo con mancuerna o polea baja (alternar)', 'Mancuerna: neutro / Polea: agarre en V', 3, '10-12', 'reps', 'https://musclewiki.com/exercises/lats/dumbbells'),
        ex('d3e4', 'Espalda', 'Pullover en polea', 'Prono en barra recta o soga', 3, '12-15', 'reps', 'https://musclewiki.com/exercise/cable-rope-pullover'),
        ex('d3e5', 'Tríceps', 'Press francés (o extensión sobre la cabeza)', 'Barra Z: prono cerrado / Soga: neutro', 3, '8-12', 'reps', 'https://musclewiki.com/exercise/cable-rope-skullcrusher'),
        ex('d3e6', 'Tríceps', 'Extensiones en polea con soga', 'Neutro, separando la soga abajo', 3, '10-15', 'reps', 'https://musclewiki.com/exercise/cable-rope-pushdown'),
        ex('d3e7', 'Tríceps', 'Fondos entre bancos o press cerrado', 'Palmas al banco / Press: prono cerrado', 3, '8-12', 'reps', 'https://musclewiki.com/exercise/barbell-close-grip-bench-press'),
        ex('d3e8', 'Abdominales', 'Plancha con peso o rueda abdominal', 'Antebrazos apoyados / rueda: prono cerrado', 3, '30-60 seg', 'time', 'https://musclewiki.com/exercise/weighted-plank-up-down')
      ],
      stretches: [
        { name: 'Dorsal colgado de la barra — 20-30 seg x2', url: 'https://greatist.com/fitness/bicep-stretch' },
        { name: 'Posición de rezo — 30-45 seg', url: 'https://www.setforset.com/blogs/news/chest-stretches' },
        { name: 'Tríceps detrás de la nuca — 30 seg/lado', url: 'https://www.healthline.com/health/exercise-fitness/tricep-stretches' },
        { name: 'Lumbar rodillas al pecho — 30-45 seg', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848' }
      ]
    }
  ]
};
