const canny = (low_thr,high_thr) => (raster, graphContext, copy_mode = true) => 
{
	let id='canny'
	
	console.log(id)
	
	let valmax;
	if (raster.type === 'uint8')
	{
		valmax=255;
	}
	
// Vertex Shader
	let src_vs = `#version 300 es
  
    in vec2 a_vertex;
    in vec2 a_texCoord;

    uniform vec2 u_resolution;
    
    out vec2 v_texCoord;
    
    void main() {
      v_texCoord = a_texCoord;
      vec2 clipSpace = a_vertex * u_resolution * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1,-1), 0.0, 1.0);
    }
  `;
  
  // Fragment Shader
let src_fs_blurH = `#version 300 es
  
    precision mediump float;
    
    in vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform float u_kernel[5];
    
    out vec4 outColor;
    
    void main(){
    	vec4 sum = vec4(0.0);

		float stepSizeH = 1.0 / float(textureSize(u_image,0).y);
		
		sum += texture(u_image, vec2(v_texCoord.x, v_texCoord.y - stepSizeH * 2.0 )) * u_kernel[0]; 
		sum += texture(u_image, vec2(v_texCoord.x, v_texCoord.y - stepSizeH)) * u_kernel[1];
		sum += texture(u_image, vec2(v_texCoord.x, v_texCoord.y )) * u_kernel[2];
		sum += texture(u_image, vec2(v_texCoord.x, v_texCoord.y + stepSizeH )) * u_kernel[3];
		sum += texture(u_image, vec2(v_texCoord.x, v_texCoord.y + stepSizeH * 2.0)) * u_kernel[4];
		sum.a = 1.0;
		outColor = sum;
     
    }`;

let shader_blurH = gpu.createProgram(graphContext,src_vs,src_fs_blurH);
 
   let gproc_blurH = gpu.createGPU(graphContext,raster.width,raster.height)
  	.redirectTo('fbo01','float32',0)
    .size(raster.width,raster.height)
    .geometry(gpu.rectangle(raster.width,raster.height))
    .attribute('a_vertex',2,'float', 16,0)      // X, Y
    .attribute('a_texCoord',2, 'float', 16, 8)  // S, T
    .texture(raster)
    .packWith(shader_blurH) // VAO
    .clearCanvas([0.0,1.0,1.0,1.0])
    .preprocess()
    .uniform('u_resolution',new Float32Array([1.0/raster.width,1.0/raster.height]))
    .uniform('u_image',0)
    .uniform('u_kernel', new Float32Array([0.0625,0.25,0.375,0.25,0.0625]) )
    .run(); 
    
    console.log("horizontal blur done..."); 
 
// Fragment Shader V
let src_fs_blurV = `#version 300 es
  
    precision mediump float;
    
    in vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform float u_kernel[5];
    
    out vec4 outColor;
    
    void main(){
    	vec4 sum = vec4(0.0);

		float stepSizeV = 1.0 / float(textureSize(u_image,0).x);

		sum += texture(u_image, vec2(v_texCoord.x - stepSizeV * 2.0 , v_texCoord.y)) * u_kernel[0]; 
		sum += texture(u_image, vec2(v_texCoord.x - stepSizeV, v_texCoord.y)) * u_kernel[1];
		sum += texture(u_image, vec2(v_texCoord.x, v_texCoord.y )) * u_kernel[2];
		sum += texture(u_image, vec2(v_texCoord.x + stepSizeV, v_texCoord.y )) * u_kernel[3];
		sum += texture(u_image, vec2(v_texCoord.x + stepSizeV * 2.0, v_texCoord.y)) * u_kernel[4];
		
		sum.a = 1.0;
		outColor = sum;
     
    }`;  

let shader_blurV = gpu.createProgram(graphContext,src_vs,src_fs_blurV);

let gproc_blurV = gpu.createGPU(graphContext)
    .size(raster.width,raster.height)
    .geometry(gpu.rectangle(raster.width,raster.height))
    .attribute('a_vertex',2,'float', 16,0)      // X, Y
    .attribute('a_texCoord',2, 'float', 16, 8)  // S, T
    .texture(gproc_blurH.framebuffers['fbo01'])
    .redirectTo('fbo02','float32',0)
    .packWith(shader_blurV) // VAO
    .clearCanvas([0.0,1.0,1.0,1.0])
    .preprocess()
    .uniform('u_resolution',new Float32Array([1.0/raster.width,1.0/raster.height]))
    .uniform('u_image',0)
    .uniform('u_kernel', new Float32Array([0.0625,0.25,0.375,0.25,0.0625]) )
    .run();
    
	console.log("vertical blur done..."); 
  
// Fragment Shader
let src_fs_sobel = `#version 300 es
  
    precision mediump float;
    
    in vec2 v_texCoord;
    uniform sampler2D u_image;
    const mat2 ROTATION_MATRIX = mat2(0.92388, 0.38268, -0.38268, 0.92388); // 1/16 turn rotation matrix
    uniform float u_kernel_H[9]; //wrong kernels (not flipped) in original version !! hahahahaha I am the best :)
    uniform float u_kernel_V[9];
    
    out vec4 outColor;
    
    void main(){
		
		float stepSizeX = 1.0 / float(textureSize(u_image,0).x);
		float stepSizeY = 1.0 / float(textureSize(u_image,0).y);
		
		//get the 9 neighboring pixel intensities
		float a11 = texture(u_image, v_texCoord - vec2(stepSizeX,stepSizeY)).r;
		float a12 = texture(u_image, vec2(v_texCoord.s, v_texCoord.t - stepSizeY)).r;
		float a13 = texture(u_image, vec2(v_texCoord.s + stepSizeX, v_texCoord.t - stepSizeY)).r;
		
		float a21 = texture(u_image, vec2(v_texCoord.s - stepSizeX, v_texCoord.t)).r;
		float a22 = texture(u_image, v_texCoord).r;
		float a23 = texture(u_image, vec2(v_texCoord.s + stepSizeX, v_texCoord.t)).r;
		
		float a31 = texture(u_image, vec2(v_texCoord.s - stepSizeX, v_texCoord.t + stepSizeY)).r;
		float a32 = texture(u_image, vec2(v_texCoord.s, v_texCoord.t + stepSizeX)).r;
		float a33 = texture(u_image, v_texCoord + vec2(stepSizeX,stepSizeY)).r;
		
		//gradient vector
		vec2 sobel = vec2 (u_kernel_H[0] * a11 + u_kernel_H[1] * a12 + u_kernel_H[2] * a13 + u_kernel_H[3] * a21 + u_kernel_H[4] * a22 + u_kernel_H[5] * a23 + u_kernel_H[6] * a31 + u_kernel_H[7] * a32 + u_kernel_H[8] * a33, u_kernel_V[0] * a11 + u_kernel_V[1] * a12 + u_kernel_V[2] * a13 + u_kernel_V[3] * a21 + u_kernel_V[4] * a22 + u_kernel_V[5] * a23 + u_kernel_V[6] * a31 + u_kernel_V[7] * a32 + u_kernel_V[8] * a33);
		//vec2 sobelAbs = abs(sobel);
		
		vec2 rotatedSobel = ROTATION_MATRIX * sobel;
		vec2 quadrantSobel = vec2(rotatedSobel.x * rotatedSobel.x - rotatedSobel.y * rotatedSobel.y, 2.0 * rotatedSobel.x * rotatedSobel.y);
		
		//gradient direction
		vec2 neighDir = vec2(step(-1.5, sign(quadrantSobel.x) + sign(quadrantSobel.y)), step(0.0, - quadrantSobel.x) - step(0.0, quadrantSobel.x) * step(0.0, - quadrantSobel.y));
		
		//outColor.r = (sobelAbs.x + sobelAbs.y) * 0.125; //gradient magnitude 
		outColor.r = sqrt(sobel.x*sobel.x + sobel.y*sobel.y); //gradient magnitude
		outColor.gb = neighDir * 0.5 + vec2(0.5); // gradient direction
		outColor.a = 0.0;
     
    }`;

let shader_sobel = gpu.createProgram(graphContext,src_vs,src_fs_sobel);

  console.log('sobel filter done...');
 
   let gproc_sobel = gpu.createGPU(graphContext,raster.width,raster.height)
    .size(raster.width,raster.height)
    .redirectTo('fbo1','float32',0)
    .geometry(gpu.rectangle(raster.width,raster.height))
    .attribute('a_vertex',2,'float', 16,0)      // X, Y
    .attribute('a_texCoord',2, 'float', 16, 8)  // S, T
    .texture(gproc_blurV.framebuffers['fbo02'])
    .packWith(shader_sobel) // VAO
    .clearCanvas([0.0,1.0,1.0,1.0])
    .preprocess()
    .uniform('u_resolution',new Float32Array([1.0/raster.width,1.0/raster.height]))
    .uniform('u_image',0)
    .uniform('u_kernel_H', new Float32Array([1,0,-1,2,0,-2,1,0,-1]))
    .uniform('u_kernel_V', new Float32Array([-1,-2,-1,0,0,0,1,2,1]))
    .run(); 
    
// Fragment Shader
let src_fs_nonmax = `#version 300 es
  
    precision mediump float;
    
    in vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform vec2 threshold;

    out vec4 outColor;
    
    void main(){

		float stepSizeX = 1.0 / float(textureSize(u_image,0).x);
		float stepSizeY = 1.0 / float(textureSize(u_image,0).y);

		vec4 texCoord = texture(u_image, v_texCoord);
		vec2 neighDir = texCoord.gb * 2.0 - vec2(1.0);
		
		vec4 n1 = texture(u_image, v_texCoord + (neighDir * vec2(stepSizeX,stepSizeY))); //grad of neighboring pixel in grad direction
		vec4 n2 = texture(u_image, v_texCoord - (neighDir * vec2(stepSizeX,stepSizeY))); //grad of opposite neighboring pixel in grad direction
		float edgeStrength = texCoord.r * step(max(n1.r,n2.r), texCoord.r); // step returns 0 if grad is not a maximum , returns 1 if grad is a maximum, then multiplied by grad of the current pixel
		outColor = vec4(smoothstep(threshold.s, threshold.t, edgeStrength),0.0,0.0,0.0); //returns a value between 0 and 1 if grad is between low thr and high thr 
     
    }`;

let shader_nonmax = gpu.createProgram(graphContext,src_vs,src_fs_nonmax);

  console.log('non maximum suppression done...');    
    
    let gproc_nonmax = gpu.createGPU(graphContext,raster.width,raster.height)
    .size(raster.width,raster.height)
    .geometry(gpu.rectangle(raster.width,raster.height))
    .attribute('a_vertex',2,'float', 16,0)      // X, Y
    .attribute('a_texCoord',2, 'float', 16, 8)  // S, T
    .texture(gproc_sobel.framebuffers['fbo1'])
    .redirectTo('fbo2','float32',0)
    .packWith(shader_nonmax) // VAO
    .clearCanvas([0.0,1.0,1.0,1.0])
    .preprocess()
    .uniform('u_resolution',new Float32Array([1.0/raster.width,1.0/raster.height]))
    .uniform('u_image',0)
    .uniform('threshold', new Float32Array([low_thr/valmax,high_thr/valmax]))
    .run(); 
    
// Fragment Shader
let src_fs_hysteresis = `#version 300 es
  
    precision mediump float;
    
    in vec2 v_texCoord;
    uniform sampler2D u_image;
    
    out vec4 outColor;
    
    void main(){
		
		float stepSizeX = 1.0 / float(textureSize(u_image,0).x);
		float stepSizeY = 1.0 / float(textureSize(u_image,0).y);
	
		float edgeStrength = texture(u_image, v_texCoord).r;
	
		//get the 8 neighboring pixels' edge strength
		float a11 = texture(u_image, v_texCoord - vec2(stepSizeX,stepSizeY)).r;
		float a12 = texture(u_image, vec2(v_texCoord.s, v_texCoord.t - stepSizeY)).r;
		float a13 = texture(u_image, vec2(v_texCoord.s + stepSizeX, v_texCoord.t - stepSizeY)).r;
		
		float a21 = texture(u_image, vec2(v_texCoord.s - stepSizeX, v_texCoord.t)).r;
		float a23 = texture(u_image, vec2(v_texCoord.s + stepSizeX, v_texCoord.t)).r;
		
		float a31 = texture(u_image, vec2(v_texCoord.s - stepSizeX, v_texCoord.t + stepSizeY)).r;
		float a32 = texture(u_image, vec2(v_texCoord.s, v_texCoord.t + stepSizeX)).r;
		float a33 = texture(u_image, v_texCoord + vec2(stepSizeX,stepSizeY)).r;
		
		float strongPixel = step(2.0, edgeStrength + a11 + a12 + a13 + a21 + a23 + a31 + a32 + a33); //accept weak pixel if the sum of edge strength is > 2.0
		float px = strongPixel + (edgeStrength - strongPixel) * step(0.49, abs(edgeStrength - 0.5)); // 1 if edge, 0 if not edge
		outColor = vec4(px,px,px,1.0); // white if edge, black if not edge
     
    }`;

let shader_hysteresis = gpu.createProgram(graphContext,src_vs,src_fs_hysteresis);

  console.log('hysteresis done...');    
    
    let gproc_hysteresis = gpu.createGPU(graphContext,raster.width,raster.height)
    .size(raster.width,raster.height)
    .geometry(gpu.rectangle(raster.width,raster.height))
    .attribute('a_vertex',2,'float', 16,0)      // X, Y
    .attribute('a_texCoord',2, 'float', 16, 8)  // S, T
    .texture(gproc_nonmax.framebuffers['fbo2'])
    .packWith(shader_hysteresis) // VAO
    .clearCanvas([0.0,1.0,1.0,1.0])
    .preprocess()
    .uniform('u_resolution',new Float32Array([1.0/raster.width,1.0/raster.height]))
    .uniform('u_image',0)
    .run(); 
 
  return raster;
  
}
