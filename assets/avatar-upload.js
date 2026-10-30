/* Deterministic, local-only avatar resizing. No Storage or profile writes. */
(function(root){
  'use strict';
  const MAX_INPUT=5*1024*1024,MAX_OUTPUT=200*1024,MAX_EDGE=512;
  const MIME=new Set(['image/jpeg','image/png','image/webp']),prepared=new WeakSet();
  function validationError(file){
    if(!file||!MIME.has(file.type))return 'Chọn ảnh JPEG, PNG hoặc WebP tĩnh. GIF, HEIC và các định dạng khác chưa được hỗ trợ.';
    if(!file.size)return 'Ảnh đang trống. Hãy chọn ảnh khác.';
    if(file.size>MAX_INPUT)return 'Ảnh đầu vào tối đa 5 MB. Hãy thu nhỏ ảnh trước khi chọn.';
    return '';
  }
  function ascii(bytes,start,length){return String.fromCharCode(...bytes.subarray(start,start+length));}
  async function checkContainer(file){
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
    const invalid=()=>{throw new Error('Nội dung ảnh không đúng định dạng hoặc đã bị hỏng.');};
    if(file.type==='image/jpeg'){
      if(bytes.length<3||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)invalid();
    }else if(file.type==='image/png'){
      if(bytes.length<24||bytes[0]!==137||ascii(bytes,1,7)!=='PNG\r\n\x1a\n')invalid();
      if(view.getUint32(16)*view.getUint32(20)>40000000)throw new Error('Ảnh tối đa 40 megapixel. Hãy thu nhỏ ảnh trước khi chọn.');
      for(let at=8;at+12<=bytes.length;){
        const length=view.getUint32(at),type=ascii(bytes,at+4,4);
        if(at+length+12>bytes.length)invalid();
        if(type==='acTL')throw new Error('Ảnh PNG động chưa được hỗ trợ. Hãy chọn ảnh tĩnh để giữ đúng nội dung.');
        at+=length+12;if(type==='IEND')break;
      }
    }else{
      if(bytes.length<20||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP')invalid();
      for(let at=12;at+8<=bytes.length;){
        const type=ascii(bytes,at,4),length=view.getUint32(at+4,true);
        if(at+8+length>bytes.length)invalid();
        if(type==='ANIM'||type==='ANMF'||type==='VP8X'&&(bytes[at+8]&2))throw new Error('Ảnh WebP động chưa được hỗ trợ. Hãy chọn ảnh tĩnh để giữ đúng nội dung.');
        at+=8+length+(length%2);
      }
    }
  }
  async function decode(file){
    if(typeof createImageBitmap==='function'){
      try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}
    }
    const url=URL.createObjectURL(file),img=new Image();
    try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
  }
  function encode(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Chưa thể tối ưu ảnh trên trình duyệt này.')),type,quality));}
  async function optimize(file){
    const error=validationError(file);if(error)throw new Error(error);
    if(prepared.has(file))return file;
    await checkContainer(file);
    let image;
    try{
      try{image=await decode(file);}catch{throw new Error('Không đọc được ảnh. Hãy chọn ảnh JPEG, PNG hoặc WebP tĩnh khác.');}
      const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
      if(!width||!height||width*height>40000000)throw new Error('Ảnh tối đa 40 megapixel và phải có kích thước hợp lệ.');
      if(Math.max(width,height)<=MAX_EDGE&&file.size<=MAX_OUTPUT){prepared.add(file);return file;}
      const canvas=document.createElement('canvas'),scale=Math.min(1,MAX_EDGE/Math.max(width,height));
      let edge=MAX_EDGE;
      function draw(factor){
        canvas.width=Math.max(1,Math.round(width*scale*factor));canvas.height=Math.max(1,Math.round(height*scale*factor));
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Trình duyệt chưa hỗ trợ tối ưu ảnh.');
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);return ctx;
      }
      const ctx=draw(1);let blob=await encode(canvas,'image/webp',.86),type=blob.type;
      if(type!=='image/webp'){
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let alpha=false;
        for(let i=3;i<pixels.length;i+=4)if(pixels[i]<255){alpha=true;break;}
        type=alpha?'image/png':'image/jpeg';blob=await encode(canvas,type,.86);
      }
      for(const quality of [.78,.7,.62])if(blob.size>MAX_OUTPUT&&type!=='image/png')blob=await encode(canvas,type,quality);
      // PNG fallback keeps transparency on browsers without a WebP encoder.
      while(blob.size>MAX_OUTPUT&&edge>128){edge=Math.max(128,Math.floor(edge*.8));draw(edge/MAX_EDGE);blob=await encode(canvas,type,.78);}
      if(blob.size>MAX_OUTPUT)throw new Error('Chưa thể tối ưu ảnh dưới 200 KB. Hãy chọn ảnh khác.');
      const ext=type==='image/webp'?'webp':type==='image/png'?'png':'jpg';
      const output=new File([blob],'avatar.'+ext,{type,lastModified:Date.now()});prepared.add(output);return output;
    }catch(error){throw new Error(error?.message||'Không đọc được ảnh. Hãy chọn ảnh JPEG, PNG hoặc WebP tĩnh khác.');}
    finally{image?.close?.();}
  }
  root.NcaAvatarUpload=Object.freeze({validationError,optimize,MAX_INPUT,MAX_OUTPUT,MAX_EDGE});
})(window);
