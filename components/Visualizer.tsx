import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  isActive: boolean;
  inputVolume: number;
  outputVolume: number;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, inputVolume, outputVolume }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      
      if (!isActive) {
        // Draw idle state (gentle breathing circle)
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 50 + Math.sin(time * 0.05) * 5;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(147, 197, 253, 0.2)'; // Blue-300 transparent
        ctx.fill();
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Active state
        // We blend input and output volume for a responsive feel
        // If AI is speaking (outputVolume > 0.01), it dominates the visual
        const volume = Math.max(inputVolume, outputVolume);
        const isAiSpeaking = outputVolume > 0.01;
        
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Dynamic base radius
        const baseRadius = 60;
        const dynamicRadius = baseRadius + (volume * 100);
        
        // Color shift based on who is talking
        // Blue/Teal for User, Purple/Pink for AI
        const hue = isAiSpeaking ? 280 : 190; // Purple vs Cyan
        
        // Core orb
        const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, dynamicRadius);
        gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.0)`);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, dynamicRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Ripples
        for (let i = 0; i < 3; i++) {
           const rippleRadius = dynamicRadius + (Math.sin(time * 0.1 + i) * 10) + (i * 20);
           ctx.beginPath();
           ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
           ctx.strokeStyle = `hsla(${hue}, 70%, 70%, ${0.3 - (i * 0.1)})`;
           ctx.lineWidth = 2;
           ctx.stroke();
        }
      }

      time++;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isActive, inputVolume, outputVolume]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={400} 
      className="w-full max-w-[400px] h-auto aspect-square"
    />
  );
};

export default Visualizer;
