"""Execute com python -m unittest discover -s backend/tests (PYTHONPATH=backend)."""
import asyncio
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx

from app.core.entra_groups import check_memberships, membership_state
from app.core.auth import is_admin


class GraphMembershipTest(unittest.TestCase):
    def test_batched_group_memberships_are_transitive_graph_results(self):
        group_ids = [str(uuid4()) for _ in range(45)]
        chunks = []

        def handler(request):
            chunks.append(request)
            batch = __import__('json').loads(request.content)['groupIds']
            self.assertLessEqual(len(batch), 20)
            self.assertEqual(request.url.path, '/v1.0/me/checkMemberGroups')
            return httpx.Response(200, json={'value': [batch[-1]]})

        original = httpx.AsyncClient
        def fake_client(*args, **kwargs):
            return original(*args, transport=httpx.MockTransport(handler), **kwargs)

        with patch('app.core.entra_groups.httpx.AsyncClient', side_effect=fake_client):
            result = asyncio.run(check_memberships('test-delegated-token', group_ids))
        self.assertEqual(len(chunks), 3)
        self.assertEqual(result, sorted([group_ids[19], group_ids[39], group_ids[44]]))

    def test_fails_if_graph_claims_unrequested_id(self):
        ids = [str(uuid4())]
        def handler(request):
            return httpx.Response(200, json={'value': [str(uuid4())]})
        original = httpx.AsyncClient
        with patch('app.core.entra_groups.httpx.AsyncClient', side_effect=lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs)):
            with self.assertRaises(ValueError):
                asyncio.run(check_memberships('token', ids))

    def test_graph_error_never_grants_admin_app_role(self):
        identity = {'local': False, 'roles': ['Portal.Admin'], 'groups_status': 'error'}
        self.assertFalse(is_admin(identity))

    def test_state_metadata(self):
        state = membership_state(['a'], 'ok', 3)
        self.assertEqual(state['groups_revision'], 3)
        self.assertEqual(state['groups_status'], 'ok')


if __name__ == '__main__':
    unittest.main()
