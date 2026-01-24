import { useState, useEffect } from 'react';
import Head from 'next/head';
import ColAIFramework from '../components/ColAIFramework';

export default function Home() {
  return (
    <>
      <Head>
        <title>ColAI - Collaborative AI Ecosystem</title>
        <meta name="description" content="A collaborative framework where neural networks work together through iterative dialogue" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <ColAIFramework />
      </main>
    </>
  );
}
