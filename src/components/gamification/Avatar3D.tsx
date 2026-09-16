import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls, Center, ContactShadows } from "@react-three/drei";
import { Box3, Vector3, type Group } from "three";

/**
 * Visualizador 3D (react-three-fiber). Luzes próprias (sem HDRI externo) p/ funcionar offline.
 * Zoom habilitado (scroll/pinça) com limites; arraste p/ girar.
 */
function Model({ src, clip, target = 1.9 }: { src: string; clip?: string; target?: number }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(src);
  const { actions, names } = useAnimations(animations, group);

  // normaliza a altura: todos os modelos ficam ~do mesmo tamanho
  const norm = useMemo(() => {
    const size = new Vector3();
    new Box3().setFromObject(scene).getSize(size);
    return target / (size.y || 1);
  }, [scene, target]);

  useEffect(() => {
    if (!names.length) return;
    const pick =
      (clip && names.find((n) => n.toLowerCase() === clip.toLowerCase())) ||
      names.find((n) => /idle/i.test(n)) ||
      names[0];
    const action = pick ? actions[pick] : null;
    action?.reset().fadeIn(0.25).play();
    return () => { action?.fadeOut(0.25); };
  }, [actions, names, clip]);

  return (
    <group ref={group} scale={norm}>
      <primitive object={scene} />
    </group>
  );
}

interface Props {
  src: string;
  clip?: string;
  height?: number;
  autoRotate?: boolean;
  className?: string;
}

export function Avatar3D({ src, clip, height = 340, autoRotate = true, className }: Props) {
  return (
    <div className={className} style={{ height, width: "100%" }}>
      <Canvas camera={{ position: [0, 0.2, 6], fov: 35 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1} />
        <directionalLight position={[4, 6, 3]} intensity={1.4} />
        <directionalLight position={[-4, 3, -3]} intensity={0.5} />
        <Suspense fallback={null}>
          <Center key={src}>
            <Model src={src} clip={clip} />
          </Center>
          <ContactShadows position={[0, -1.4, 0]} opacity={0.35} scale={9} blur={2.5} far={3} />
        </Suspense>
        <OrbitControls
          autoRotate={autoRotate}
          autoRotateSpeed={1.0}
          enablePan={false}
          enableZoom
          minDistance={2.5}
          maxDistance={12}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.9}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/RobotExpressive.glb");
useGLTF.preload("/models/Michelle.glb");

/* ---- Árvore 3D (Kenney Nature Kit) + frutas 3D presas à copa ---- */
function TreeScene({ src, fruitColor, showFruit, growth }: { src: string; fruitColor: string; showFruit: boolean; growth: number }) {
  const { scene } = useGLTF(src);
  const cloned = useMemo(() => scene.clone(), [scene]);
  // posições aproximadas na copa (sobem/giram junto com a árvore)
  const fruitPos: [number, number, number][] = [
    [-0.45, 0.95, 0.35], [0.5, 0.85, -0.2], [0.12, 1.15, 0.4], [0.4, 1.05, 0.35], [-0.35, 0.8, -0.4],
  ];
  return (
    <Center key={src}>
      <group scale={1.7 * growth}>
        <primitive object={cloned} />
        {showFruit && fruitPos.map((p, i) => (
          <mesh key={i} position={p} castShadow>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={fruitColor} roughness={0.35} metalness={0.05} />
          </mesh>
        ))}
      </group>
    </Center>
  );
}

export function Tree3D({ src, fruitColor = "#e2483d", showFruit = false, growth = 1, height = 200, autoRotate = true }:
  { src: string; fruitColor?: string; showFruit?: boolean; growth?: number; height?: number; autoRotate?: boolean }) {
  return (
    <div style={{ height, width: "100%" }}>
      <Canvas camera={{ position: [0, 1.0, 3.4], fov: 42 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.15} />
        <directionalLight position={[3, 6, 3]} intensity={1.5} />
        <directionalLight position={[-3, 3, -2]} intensity={0.5} />
        <Suspense fallback={null}>
          <TreeScene src={src} fruitColor={fruitColor} showFruit={showFruit} growth={growth} />
          <ContactShadows position={[0, -1.05, 0]} opacity={0.3} scale={5} blur={2.6} far={2} />
        </Suspense>
        <OrbitControls
          autoRotate={autoRotate}
          autoRotateSpeed={0.8}
          enablePan={false}
          enableZoom
          minDistance={2}
          maxDistance={7}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.95}
        />
      </Canvas>
    </div>
  );
}
