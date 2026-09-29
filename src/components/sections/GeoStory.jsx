import { useInView } from 'framer-motion';
import { lazy, Suspense, useRef, useState } from 'react';
import ClientsShowcase from './ClientsShowcase';
import Locations from './Locations';
import './GeoStory.css';

// The globe (engine + IBGE meshes) loads on its own, off the critical path.
const GeoGlobe = lazy(() => import('../globe/GeoGlobe'));

const START = {
  phase: 'locations',
  offices: { active: -1, reached: 0 },
  clients: { active: -1, reached: 0, overview: 0 },
};

/**
 * "Onde encontrar o Grupo LWN" + "Nossos Clientes" around ONE globe.
 *
 * The globe lives in a layer that spans both sections and stays pinned while
 * either is on screen; each section is its own scroll track with its copy
 * pinned on the left. The globe makes one continuous journey: the offices
 * through the first track, then — without resetting — it pulls back over the
 * region and carries on through the client states in the second.
 */
export default function GeoStory() {
  const wrapRef = useRef(null);
  const locationsRef = useRef(null);
  const clientsRef = useRef(null);
  const near = useInView(wrapRef, { once: true, margin: '900px 0px' });
  const [step, setStep] = useState(START);

  const { offices, clients } = step;

  return (
    <div ref={wrapRef} className="geo">
      <div className="geo__layer">
        <div className="geo__sticky">
          <div className="geo__frame">
            {near && (
              <Suspense fallback={null}>
                <GeoGlobe wrapRef={wrapRef} locationsRef={locationsRef} clientsRef={clientsRef} onStep={setStep} />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      <Locations ref={locationsRef} step={offices} />
      <ClientsShowcase ref={clientsRef} step={clients} />
    </div>
  );
}
