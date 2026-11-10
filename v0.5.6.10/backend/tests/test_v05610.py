"""Regressões sem credenciais externas. Executar: PYTHONPATH=backend python -m unittest discover -s backend/tests."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

from pydantic import ValidationError
from app.schemas.cluster import ClusterCreate, ClusterUpdate
from app.schemas.component import QueueUpdate, QueueConfigurationSave


class DimensionAndVicciTests(unittest.TestCase):
    def setUp(self):
        self.cluster_data = dict(name='rabbit01', environment='prod', dns='rabbit.example',
                                 api_username='rabbit', api_password='secret')

    def test_legacy_cluster_defaults_preserved(self):
        c = ClusterCreate(**self.cluster_data)
        self.assertTrue(c.datadog_use_cluster_dimension)
        self.assertEqual(c.datadog_extra_dimensions, [])

    def test_static_filters_when_no_cluster_tag(self):
        c = ClusterCreate(**self.cluster_data, datadog_cluster_tag_value='saved-label',
                          datadog_use_cluster_dimension=False,
                          datadog_extra_dimensions=[{'key':'environment','value':'production'},
                                                    {'key':'service','value':'myapp'}])
        self.assertEqual(c.datadog_cluster_tag_value, 'saved-label')
        self.assertEqual(len(c.datadog_extra_dimensions), 2)

    def test_requires_dimension_when_cluster_filter_disabled(self):
        with self.assertRaises(ValidationError):
            ClusterCreate(**self.cluster_data, datadog_use_cluster_dimension=False)

    def test_rejects_duplicate_reserved_invalid_dimensions(self):
        for extra in [[{'key':'vhost','value':'prod'}],
                      [{'key':'env','value':'x'},{'key':'env','value':'y'}],
                      [{'key':'env','value':'a,b'}],
                      [{'key':'bad key','value':'prod'}]]:
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                ClusterCreate(**self.cluster_data, datadog_extra_dimensions=extra)

    def test_vicci_email_rejects_trailing_comma_and_lists(self):
        for email in ['dl@exemplo.com,', 'dl@exemplo.com,outro@exemplo.com',
                      ' dl@exemplo.com', 'dl@exemplo.com;', 'dl@exemplo.com\n']:
            with self.subTest(email=email), self.assertRaises(ValidationError):
                QueueUpdate(notify_vicci=True, vicci_email=email)
        self.assertEqual(str(QueueUpdate(vicci_email='dl@exemplo.com').vicci_email), 'dl@exemplo.com')
        with self.assertRaises(ValidationError):
            QueueConfigurationSave(metadata={'vicci_email':'dl@exemplo.com,'}, templates=[])

    def test_planner_scope_with_dynamic_filters(self):
        # Compilar apenas as funções puras, sem iniciar MySQL/Redis.
        source = Path(__file__).resolve().parents[1] / 'app/services/datadog_planner_service.py'
        tree = ast.parse(source.read_text())
        selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and
                    node.name in ('_dd_tag_value','_cluster_tag_value','_integration_context')]
        future = ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0)
        ast.fix_missing_locations(future)
        module = ast.Module(body=[future]+selected, type_ignores=[])
        ast.fix_missing_locations(module)
        namespace = {'_public_reference_url':lambda *args:'https://portal.example/public'}
        exec(compile(module, str(source), 'exec'), namespace)
        cluster = SimpleNamespace(datadog_cluster_tag_key='rabbitmq_cluster',
                                  datadog_cluster_tag_value='rabbit01',name='rabbit01',
                                  datadog_use_cluster_dimension=True,datadog_extra_dimensions=[],
                                  datadog_vhost_tag_key='vhost', datadog_queue_tag_key='queue',
                                  datadog_integration_type='custom',datadog_node_tag_key=None,
                                  datadog_metric_messages='rabbitmq.queue.messages',
                                  datadog_metric_consumers='rabbitmq.queue.consumers')
        queue=SimpleNamespace(vhost='/',name='orders')
        default=namespace['_integration_context'](cluster,queue)['datadog_scope']
        self.assertEqual(default,'rabbitmq_cluster:rabbit01,vhost:/,queue:orders')
        cluster.datadog_use_cluster_dimension=False
        cluster.datadog_extra_dimensions=[{'key':'environment','value':'production'}]
        scope=namespace['_integration_context'](cluster,queue)['datadog_scope']
        self.assertEqual(scope,'environment:production,vhost:/,queue:orders')


if __name__ == '__main__':
    unittest.main()
