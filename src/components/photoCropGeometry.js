export function photoFitZoom(media, box) {
  if(!media||!box||![media.width,media.height,box.width,box.height].every(value=>Number.isFinite(value)&&value>0))return null;
  return Math.min(box.width/media.width,box.height/media.height);
}

// Preserve the position of the image when the crop extends beyond its edges.
export function photoCropDrawRect(image,crop,size) {
  if(![image.width,image.height,crop.width,crop.height,size].every(value=>Number.isFinite(value)&&value>0)||![crop.x,crop.y].every(Number.isFinite))throw new Error('No se pudo calcular el encuadre.');
  const x=Math.max(0,crop.x),y=Math.max(0,crop.y);
  const width=Math.min(image.width,crop.x+crop.width)-x,height=Math.min(image.height,crop.y+crop.height)-y;
  if(width<=0||height<=0)throw new Error('Deja parte de la foto dentro del encuadre antes de continuar.');
  return [x,y,width,height,(x-crop.x)*size/crop.width,(y-crop.y)*size/crop.height,width*size/crop.width,height*size/crop.height];
}
