/* eslint-disable */
import prismaMock from '../prisma-mock';
import express, { NextFunction, Request, Response } from 'express';
import * as bodyParser from 'body-parser';
import axios from 'axios';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { bulkFavoriteArticles } from '../../app/routes/article/article.service';
import articlesController from '../../app/routes/article/article.controller';
import HttpException from '../../app/models/http-exception.model';
import generateToken from '../../app/routes/auth/token.utils';

describe('Bulk Favorite Articles', () => {
  const userId = 100;
  const validToken = generateToken(userId);

  const mockedUser = {
    id: userId,
    username: 'RealWorldUser',
    email: 'user@realworld.io',
    password: 'password123',
    bio: 'bio text',
    image: null,
    demo: false,
  };

  const createMockedArticle = (id: number, slug: string, isFavorited: boolean) => ({
    id,
    slug,
    title: `Article ${id}`,
    description: `Description ${id}`,
    body: `Body ${id}`,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    authorId: 200,
    tagList: [{ name: 'tag1' }, { name: 'tag2' }],
    favoritedBy: isFavorited ? [{ id: userId }] : [],
    _count: {
      favoritedBy: isFavorited ? 1 : 0,
    },
    author: {
      username: 'AuthorUser',
      bio: 'Author bio',
      image: null,
      followedBy: [],
    },
  });

  describe('Service: bulkFavoriteArticles', () => {
    test('should favorite multiple articles successfully', async () => {
      const slugs = ['article-one', 'article-two'];
      const mockedArticles = [
        createMockedArticle(1, 'article-one', true),
        createMockedArticle(2, 'article-two', true),
      ];

      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany
        .mockResolvedValueOnce([
          { id: 1, slug: 'article-one' },
          { id: 2, slug: 'article-two' },
        ] as any)
        .mockResolvedValueOnce(mockedArticles as any);
      // @ts-ignore
      prismaMock.user.update.mockResolvedValue(mockedUser as any);

      const result = await bulkFavoriteArticles(slugs, 'favorite', userId);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          favorites: {
            connect: [{ slug: 'article-one' }, { slug: 'article-two' }],
          },
        },
      });

      expect(result).toHaveProperty('articles');
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].slug).toBe('article-one');
      expect(result.articles[0].favorited).toBe(true);
      expect(result.articles[0].favoritesCount).toBe(1);
      expect(result.articles[1].slug).toBe('article-two');
      expect(result.articles[1].favorited).toBe(true);
    });

    test('should unfavorite multiple articles successfully', async () => {
      const slugs = ['article-one', 'article-two'];
      const mockedArticles = [
        createMockedArticle(1, 'article-one', false),
        createMockedArticle(2, 'article-two', false),
      ];

      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany
        .mockResolvedValueOnce([
          { id: 1, slug: 'article-one' },
          { id: 2, slug: 'article-two' },
        ] as any)
        .mockResolvedValueOnce(mockedArticles as any);
      // @ts-ignore
      prismaMock.user.update.mockResolvedValue(mockedUser as any);

      const result = await bulkFavoriteArticles(slugs, 'unfavorite', userId);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          favorites: {
            disconnect: [{ slug: 'article-one' }, { slug: 'article-two' }],
          },
        },
      });

      expect(result).toHaveProperty('articles');
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].slug).toBe('article-one');
      expect(result.articles[0].favorited).toBe(false);
      expect(result.articles[0].favoritesCount).toBe(0);
    });

    test('should deduplicate duplicate slugs in the request', async () => {
      const slugs = ['article-one', 'article-one', 'article-two'];
      const mockedArticles = [
        createMockedArticle(1, 'article-one', true),
        createMockedArticle(2, 'article-two', true),
      ];

      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany
        .mockResolvedValueOnce([
          { id: 1, slug: 'article-one' },
          { id: 2, slug: 'article-two' },
        ] as any)
        .mockResolvedValueOnce(mockedArticles as any);
      // @ts-ignore
      prismaMock.user.update.mockResolvedValue(mockedUser as any);

      const result = await bulkFavoriteArticles(slugs, 'favorite', userId);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          favorites: {
            connect: [{ slug: 'article-one' }, { slug: 'article-two' }],
          },
        },
      });
      expect(result.articles).toHaveLength(2);
    });

    test('should throw 401 error if user is not authenticated', async () => {
      await expect(
        bulkFavoriteArticles(['article-one'], 'favorite', undefined),
      ).rejects.toMatchObject({
        errorCode: 401,
      });
    });

    test('should throw 422 error if action is invalid', async () => {
      // @ts-ignore
      await expect(
        bulkFavoriteArticles(['article-one'], 'invalid-action' as any, userId),
      ).rejects.toMatchObject({
        errorCode: 422,
      });
    });

    test('should throw 422 error if slugs is empty or not an array', async () => {
      // @ts-ignore
      await expect(bulkFavoriteArticles([], 'favorite', userId)).rejects.toMatchObject({
        errorCode: 422,
      });

      // @ts-ignore
      await expect(bulkFavoriteArticles(null as any, 'favorite', userId)).rejects.toMatchObject({
        errorCode: 422,
      });
    });

    test('should throw 422 error if slugs contains empty strings or non-strings', async () => {
      // @ts-ignore
      await expect(
        bulkFavoriteArticles(['valid-slug', '   ', 123 as any], 'favorite', userId),
      ).rejects.toMatchObject({
        errorCode: 422,
      });
    });

    test('should throw 404 error if user is not found in database', async () => {
      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        bulkFavoriteArticles(['article-one'], 'favorite', userId),
      ).rejects.toMatchObject({
        errorCode: 404,
      });
    });

    test('should throw 404 error if one or more slugs do not exist', async () => {
      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany.mockResolvedValueOnce([
        { id: 1, slug: 'existing-article' },
      ] as any);

      try {
        await bulkFavoriteArticles(
          ['existing-article', 'non-existent-article'],
          'favorite',
          userId,
        );
        fail('Expected 404 error');
      } catch (err: any) {
        expect(err.errorCode).toBe(404);
        expect(err.message.message).toContain('non-existent-article');
      }
    });
  });

  describe('Route: POST /articles/bulk-favorite', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll((done) => {
      const app = express();
      app.use(bodyParser.json());
      app.use(articlesController);

      // Error handler identical to src/main.ts
      app.use(
        (
          err: any,
          req: Request,
          res: Response,
          next: NextFunction,
        ) => {
          if (err && err.name === 'UnauthorizedError') {
            return res.status(401).json({
              status: 'error',
              message: 'missing authorization credentials',
            });
          } else if (err && err.errorCode) {
            res.status(err.errorCode).json(err.message);
          } else if (err) {
            res.status(500).json(err.message);
          }
        },
      );

      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        done();
      });
    });

    afterAll((done) => {
      server.close(done);
    });

    test('should return 200 and updated articles on valid bulk favorite request', async () => {
      const mockedArticles = [
        createMockedArticle(1, 'slug-a', true),
        createMockedArticle(2, 'slug-b', true),
      ];

      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany
        .mockResolvedValueOnce([
          { id: 1, slug: 'slug-a' },
          { id: 2, slug: 'slug-b' },
        ] as any)
        .mockResolvedValueOnce(mockedArticles as any);
      // @ts-ignore
      prismaMock.user.update.mockResolvedValue(mockedUser as any);

      const res = await axios.post(
        `${baseUrl}/articles/bulk-favorite`,
        {
          slugs: ['slug-a', 'slug-b'],
          action: 'favorite',
        },
        {
          headers: {
            Authorization: `Token ${validToken}`,
          },
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.articles).toHaveLength(2);
      expect(res.data.articles[0].slug).toBe('slug-a');
      expect(res.data.articles[0].favorited).toBe(true);
    });

    test('should work with alias route /articles/favorites', async () => {
      const mockedArticles = [createMockedArticle(1, 'slug-alias', true)];

      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany
        .mockResolvedValueOnce([{ id: 1, slug: 'slug-alias' }] as any)
        .mockResolvedValueOnce(mockedArticles as any);
      // @ts-ignore
      prismaMock.user.update.mockResolvedValue(mockedUser as any);

      const res = await axios.post(
        `${baseUrl}/articles/favorites`,
        {
          slugs: ['slug-alias'],
          action: 'favorite',
        },
        {
          headers: {
            Authorization: `Token ${validToken}`,
          },
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.articles).toHaveLength(1);
    });

    test('should return 401 when unauthenticated', async () => {
      try {
        await axios.post(`${baseUrl}/articles/bulk-favorite`, {
          slugs: ['slug-a'],
          action: 'favorite',
        });
        fail('Expected request to fail with 401');
      } catch (err: any) {
        expect(err.response.status).toBe(401);
      }
    });

    test('should return 404 when an invalid article slug is supplied', async () => {
      // @ts-ignore
      prismaMock.user.findUnique.mockResolvedValue(mockedUser as any);
      // @ts-ignore
      prismaMock.article.findMany.mockResolvedValueOnce([
        { id: 1, slug: 'slug-a' },
      ] as any);

      try {
        await axios.post(
          `${baseUrl}/articles/bulk-favorite`,
          {
            slugs: ['slug-a', 'unknown-slug'],
            action: 'favorite',
          },
          {
            headers: {
              Authorization: `Token ${validToken}`,
            },
          },
        );
        fail('Expected request to fail with 404');
      } catch (err: any) {
        expect(err.response.status).toBe(404);
        expect(JSON.stringify(err.response.data)).toContain('unknown-slug');
      }
    });

    test('should return 422 when payload is invalid', async () => {
      try {
        await axios.post(
          `${baseUrl}/articles/bulk-favorite`,
          {
            slugs: [],
            action: 'favorite',
          },
          {
            headers: {
              Authorization: `Token ${validToken}`,
            },
          },
        );
        fail('Expected request to fail with 422');
      } catch (err: any) {
        expect(err.response.status).toBe(422);
      }
    });
  });
});
