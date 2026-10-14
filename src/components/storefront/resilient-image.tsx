"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

const FALLBACK = "/images/demo/fallback.svg";

export function ResilientImage(props: ImageProps) {
  const [source, setSource] = useState(props.src);
  useEffect(() => { setSource(props.src); }, [props.src]);
  return <Image {...props} src={source} alt={props.alt} onError={(event) => {
    props.onError?.(event);
    if (source !== FALLBACK) setSource(FALLBACK);
  }} />;
}
