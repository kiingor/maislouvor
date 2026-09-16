import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls, ContactShadows } from "@react-three/drei";
import { Box3, Vector3, type Group } from "three";

export interface PodiumEntry { src: string; name: string; score: number; clip?: string }

function PodChar({ src, x, y, clip }: { src: string; x: number; y: number; clip?: string }) {
  const ref = useRef<Group>(null);
  const { scene, animations } = useGLTF(src);
  const { actions, names } = useAnimations(animations, ref);
  // mesma altura para todos os do pódio
  const norm = useMemo(() => {
    const size = new Vector3();
    new Box3().setFromObject(scene).getSize(size);
    return 1.15 / (size.y || 1);
  }, [scene]);
  useEffect(() => {
    if (!names.length) return;
    const n = (clip && names.find((m) => m.toLowerCase() === clip.toLowerCase())) || names.find((m) => /idle/i.test(m)) || names[0];
    const a = n ? actions[n] : null;
    a?.reset().fadeIn(0.2).play();
    return () => { a?.fadeOut(0.2); };
  }, [actions, names, clip]);
  return <group ref={ref} position={[x, y, 0]} scale={norm}><primitive object={scene} /></group>;
}

function Riser({ x, h, color }: { x: number; h: number; color: string }) {
  return (
    <mesh position={[x, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[1.1, h, 1.1]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.15} />
    </mesh>
  );
}

/** Pódio 3D do "Destaques" — 3 degraus (ouro/prata/bronze) com os 3 primeiros em cima. */
export function Podium3D({ top3, height = 300 }: { top3: PodiumEntry[]; height?: number }) {
  const slots = [
    { place: 2, x: -1.45, h: 0.85, color: "#c8cdd3" }, // prata (esquerda)
    { place: 1, x: 0, h: 1.2, color: "#f4c430" },      // ouro (centro)
    { place: 3, x: 1.45, h: 0.6, color: "#cd7f32" },   // bronze (direita)
  ];
  return (
    <div style={{ height, width: "100%" }}>
      <Canvas camera={{ position: [0, 1.7, 6], fov: 38 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1} />
        <directionalLight position={[4, 7, 4]} intensity={1.4} castShadow />
        <directionalLight position={[-4, 3, -2]} intensity={0.45} />
        <Suspense fallback={null}>
          {slots.map((s) => {
            const e = top3[s.place - 1];
            return (
              <group key={s.place}>
                <Riser x={s.x} h={s.h} color={s.color} />
                {e && <PodChar src={e.src} x={s.x} y={s.h} clip={e.clip} />}
              </group>
            );
          })}
          <ContactShadows position={[0, 0, 0]} opacity={0.3} scale={9} blur={2.5} far={3} />
        </Suspense>
        <OrbitControls autoRotate autoRotateSpeed={0.7} enablePan={false} enableZoom={false}
          target={[0, 0.8, 0]} minPolarAngle={Math.PI / 3.2} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
