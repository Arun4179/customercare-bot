import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  data: Uint8Array;
  isActive: boolean;
  color?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ data, isActive, color = '#6366f1' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!isActive) {
        // Draw a flat line
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = '#3f3f46'; // zinc-700
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
    }

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';

    const sliceWidth = width * 1.0 / (data.length / 4); // Only draw first quarter of spectrum for better visuals
    let x = 0;

    // Draw the frequency data
    for (let i = 0; i < data.length / 4; i++) {
        // Scale value to fit height
        const v = data[i] / 128.0; 
        const y = (v * height) / 2;

        // Mirror effect for "voice wave" look
        const yOffset = height / 2;
        
        if (i === 0) {
          ctx.moveTo(x, yOffset);
        } else {
            // Smooth curve
           ctx.lineTo(x, yOffset - (y/3)); // Dampen visuals a bit
        }
        x += sliceWidth;
    }
    ctx.stroke();

    // Mirror bottom
    ctx.beginPath();
    x = 0;
    for (let i = 0; i < data.length / 4; i++) {
        const v = data[i] / 128.0; 
        const y = (v * height) / 2;
        const yOffset = height / 2;
        if (i === 0) {
            ctx.moveTo(x, yOffset);
        } else {
            ctx.lineTo(x, yOffset + (y/3));
        }
        x += sliceWidth;
    }
    ctx.stroke();

  }, [data, isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={100} 
      className="w-full h-24 rounded-lg bg-zinc-900/50 backdrop-blur-sm"
    />
  );
};

export default AudioVisualizer;